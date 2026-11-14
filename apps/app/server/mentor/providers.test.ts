// @vitest-environment node
import Anthropic from '@anthropic-ai/sdk';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { apiErrorCode, apiParams, apiProvider, type ApiStream } from './api-provider';
import {
  chunkOf,
  cliArgs,
  cliProvider,
  loggedInWithSubscription,
  subscriptionEnv,
  type SpawnFn,
} from './cli-provider';
import { fakeProvider } from './fake-provider';
import type { ProviderChunk, ProviderInput } from './provider';

const input: ProviderInput = {
  system: 'papel + enunciado + referência',
  history: [
    { role: 'user', text: 'Por onde começo?', at: '2026-11-14T12:00:00.000Z' },
    { role: 'mentor', text: 'Pela carga.', at: '2026-11-14T12:00:01.000Z', provider: 'api' },
  ],
  state: '<desenho_atual>\n{"nodes":{"n1":{}}}\n</desenho_atual>',
  message: 'O que está saturando?',
  model: 'claude-opus-5-5',
};

async function collect(it: AsyncIterable<ProviderChunk>): Promise<ProviderChunk[]> {
  const out: ProviderChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

/** Lines in the shape `claude -p --output-format stream-json` printed on 2.1.325. */
const DELTA = (text: string) =>
  JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } },
    parent_tool_use_id: null,
  });
const RESULT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  api_error_status: null,
  result: 'Não',
  total_cost_usd: 0.007748,
  usage: {
    input_tokens: 2,
    cache_creation_input_tokens: 670,
    cache_read_input_tokens: 0,
    output_tokens: 119,
  },
});

describe('subscription provider: the installed claude, with nothing but talk (FR-12, A02, A04)', () => {
  it('starts claude with no tools, settings, MCP, commands, sessions or permissions to grant', () => {
    const args = cliArgs('claude-opus-5-5', 'system-x.txt');
    const after = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args[0]).toBe('-p');
    expect(after('--tools')).toBe('');
    expect(after('--setting-sources')).toBe('');
    expect(after('--permission-mode')).toBe('dontAsk');
    expect(after('--max-turns')).toBe('1');
    expect(after('--model')).toBe('claude-opus-5-5');
    expect(after('--system-prompt-file')).toBe('system-x.txt');
    for (const flag of [
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--no-session-persistence',
    ])
      expect(args).toContain(flag);
    expect(args.join(' ')).not.toMatch(/bypass|dangerously|--add-dir|--mcp-config/);
  });

  it('drops every API credential from the child environment', () => {
    const env = subscriptionEnv({
      ANTHROPIC_API_KEY: 'sk-ant-falsa',
      ANTHROPIC_AUTH_TOKEN: 't',
      CLAUDE_CODE_OAUTH_TOKEN: 'o',
      PATH: '/bin',
    });
    expect(env).toEqual({ PATH: '/bin' });
  });

  it('reduces `claude auth status` to one boolean, whatever else it prints', async () => {
    const real = JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      email: 'alguem@example.com',
      orgName: 'Org',
      subscriptionType: 'max',
    });
    expect(loggedInWithSubscription(real)).toBe(true);
    expect(
      loggedInWithSubscription(JSON.stringify({ loggedIn: true, authMethod: 'api_key' })),
    ).toBe(false);
    expect(loggedInWithSubscription('not json')).toBe(false);

    const exec = vi.fn(() => Promise.resolve(real));
    let t = 0;
    const p = cliProvider({ exec, env: { ANTHROPIC_API_KEY: 'k' }, now: () => t });
    expect(await p.available()).toBe(true);
    expect(await p.available()).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0]).toEqual([
      'claude',
      ['auth', 'status', '--json'],
      { env: {}, timeout: 5000 },
    ]);
    t = 61_000;
    await p.available();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('is unavailable when claude is not installed', async () => {
    const exec = () =>
      Promise.reject(Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
    expect(await cliProvider({ exec }).available()).toBe(false);
  });

  it('reads text deltas and the result; any other event is only a sign of life', () => {
    expect(chunkOf(DELTA('Olá'))).toEqual({ type: 'delta', text: 'Olá' });
    expect(chunkOf(RESULT)).toBe('result');
    expect(chunkOf(JSON.stringify({ type: 'system', subtype: 'init', tools: [] }))).toEqual({
      type: 'heartbeat',
    });
    const thinking = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '' } },
    });
    expect(chunkOf(thinking)).toEqual({ type: 'heartbeat' });
    expect(chunkOf('garbage')).toBeNull();
    expect(
      chunkOf(JSON.stringify({ type: 'result', is_error: true, api_error_status: 401 })),
    ).toEqual({ type: 'error', code: 'auth' });
    expect(
      chunkOf(JSON.stringify({ type: 'result', is_error: true, api_error_status: 429 })),
    ).toEqual({ type: 'error', code: 'rate_limit' });
  });

  /** A child process double: the test writes its stdout and decides how it exits. */
  function fakeChild() {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
      exitCode: number | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = vi.fn(() => {
      child.stdout.end();
      child.exitCode = 143;
      child.emit('close', 143);
      return true;
    });
    let stdin = '';
    child.stdin.on('data', (b: Buffer) => {
      stdin += b.toString();
    });
    const exit = (code: number) => {
      child.stdout.end();
      child.exitCode = code;
      setImmediate(() => child.emit('close', code));
    };
    return { child, exit, stdin: () => stdin };
  }

  it('streams the reply, the usage, and runs in its own empty directory', async () => {
    const f = fakeChild();
    const cwd = mkdtempSync(join(tmpdir(), 'archsim-mentor-test-'));
    let systemSeen = '';
    const spawn = vi.fn<SpawnFn>((_c, args, o) => {
      systemSeen = readFileSync(
        join(o.cwd, args[args.indexOf('--system-prompt-file') + 1] ?? ''),
        'utf8',
      );
      setImmediate(() => {
        f.child.stdout.write(`${DELTA('O RDS ')}\n${DELTA('está a 140%.')}\n${RESULT}\n`);
        f.exit(0);
      });
      return f.child as unknown as ChildProcessWithoutNullStreams;
    });
    const p = cliProvider({ spawn, cwd, env: { ANTHROPIC_API_KEY: 'sk-ant-falsa', PATH: '/bin' } });
    const chunks = await collect(p.stream(input, new AbortController().signal));
    expect(chunks).toEqual([
      { type: 'delta', text: 'O RDS ' },
      { type: 'delta', text: 'está a 140%.' },
      { type: 'usage', usage: { inputTokens: 672, outputTokens: 119, costUsd: 0.007748 } },
    ]);
    const [command, args, options] = spawn.mock.calls[0] ?? [];
    expect(command).toBe('claude');
    const file = args?.[args.indexOf('--system-prompt-file') + 1] ?? '';
    expect(file).toMatch(/^system-[0-9a-f-]{36}\.txt$/);
    expect(args).toEqual(cliArgs('claude-opus-5-5', file));
    expect(options).toEqual({ cwd, env: { PATH: '/bin' } });
    expect(systemSeen).toBe(input.system);
    // the prompt file is gone once the reply ends
    expect(existsSync(join(cwd, file))).toBe(false);
    expect(f.stdin()).toContain('<conversa_anterior>');
    expect(f.stdin()).toContain('[mentor]\nPela carga.');
    expect(f.stdin()).toContain(input.state);
    expect(f.stdin().endsWith('[pessoa]\nO que está saturando?')).toBe(true);
  });

  it('kills claude when the person stops the reply', async () => {
    const f = fakeChild();
    const spawn: SpawnFn = () => {
      setImmediate(() => f.child.stdout.write(`${DELTA('Começo')}\n`));
      return f.child as unknown as ChildProcessWithoutNullStreams;
    };
    const p = cliProvider({ spawn, cwd: mkdtempSync(join(tmpdir(), 'archsim-mentor-test-')) });
    const controller = new AbortController();
    const chunks: ProviderChunk[] = [];
    for await (const c of p.stream(input, controller.signal)) {
      chunks.push(c);
      controller.abort();
    }
    expect(f.child.kill).toHaveBeenCalled();
    expect(chunks).toEqual([{ type: 'delta', text: 'Começo' }]);
  });

  it('gives two replies at once their own prompt file, in a private directory', async () => {
    const files: string[] = [];
    const spawn: SpawnFn = (_c, args, o) => {
      files.push(join(o.cwd, args[args.indexOf('--system-prompt-file') + 1] ?? ''));
      const f = fakeChild();
      setImmediate(() => {
        f.child.stdout.write(`${RESULT}\n`);
        f.exit(0);
      });
      return f.child as unknown as ChildProcessWithoutNullStreams;
    };
    const p = cliProvider({ spawn });
    await Promise.all([
      collect(p.stream({ ...input, system: 'A' }, new AbortController().signal)),
      collect(p.stream({ ...input, system: 'B' }, new AbortController().signal)),
    ]);
    expect(new Set(files).size).toBe(2);
    const dir = dirname(files[0] ?? '');
    expect(dirname(files[1] ?? '')).toBe(dir);
    expect(dir.startsWith(join(tmpdir(), 'archsim-mentor-'))).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('reports an exit with code 0 but no result as an error', async () => {
    const f = fakeChild();
    const spawn: SpawnFn = () => {
      setImmediate(() => {
        f.exit(0);
      });
      return f.child as unknown as ChildProcessWithoutNullStreams;
    };
    const p = cliProvider({ spawn, cwd: mkdtempSync(join(tmpdir(), 'archsim-mentor-test-')) });
    expect(await collect(p.stream(input, new AbortController().signal))).toEqual([
      { type: 'error', code: 'unknown' },
    ]);
  });

  it('reports an exit without a result as an error', async () => {
    const f = fakeChild();
    const spawn: SpawnFn = () => {
      setImmediate(() => {
        f.exit(1);
      });
      return f.child as unknown as ChildProcessWithoutNullStreams;
    };
    const p = cliProvider({ spawn, cwd: mkdtempSync(join(tmpdir(), 'archsim-mentor-test-')) });
    expect(await collect(p.stream(input, new AbortController().signal))).toEqual([
      { type: 'error', code: 'unknown' },
    ]);
  });
});

describe('API provider (FR-12, FR-13, FR-15, A07)', () => {
  function streamOf(events: BetaRawMessageStreamEvent[], stopReason = 'end_turn'): ApiStream {
    return {
      async *[Symbol.asyncIterator]() {
        for (const e of events) {
          await Promise.resolve();
          yield e;
        }
      },
      finalMessage: () =>
        Promise.resolve({
          stop_reason: stopReason,
          usage: {
            input_tokens: 1000,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 2000,
          },
        } as Awaited<ReturnType<ApiStream['finalMessage']>>),
    };
  }
  const delta = (text: string) =>
    ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    }) as BetaRawMessageStreamEvent;

  it('sends no tools, caches the stable prefix and puts the diagram in the last turn', () => {
    const params = apiParams(input);
    expect(params).not.toHaveProperty('tools');
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.system).toEqual([
      { type: 'text', text: input.system, cache_control: { type: 'ephemeral' } },
    ]);
    expect(params.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(params.messages.at(-1)?.content).toBe(`${input.state}\n\nO que está saturando?`);
  });

  it('is available only with a key, and streams text then usage', async () => {
    expect(await apiProvider({ env: {} }).available()).toBe(false);
    const p = apiProvider({
      env: { ANTHROPIC_API_KEY: 'sk-ant-falsa' },
      stream: () => streamOf([delta('O RDS '), delta('satura.')]),
    });
    expect(await p.available()).toBe(true);
    const chunks = await collect(p.stream(input, new AbortController().signal));
    expect(chunks.slice(0, 2)).toEqual([
      { type: 'delta', text: 'O RDS ' },
      { type: 'delta', text: 'satura.' },
    ]);
    // cache reads at 0.1× the input price
    expect(chunks[2]).toEqual({
      type: 'usage',
      usage: {
        inputTokens: 3000,
        outputTokens: 50,
        costUsd: (1000 * 4 + 2000 * 0.4 + 50 * 20) / 1e6,
      },
    });
  });

  it('turns thinking into heartbeats, and gives no cost for a model it has no prices for', async () => {
    const thinking = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: '' },
    } as BetaRawMessageStreamEvent;
    const p = apiProvider({
      env: { ANTHROPIC_API_KEY: 'k' },
      stream: () => streamOf([thinking, delta('ok')]),
    });
    const chunks = await collect(
      p.stream({ ...input, model: 'claude-sonnet-5-5' }, new AbortController().signal),
    );
    expect(chunks[0]).toEqual({ type: 'heartbeat' });
    expect(chunks.at(-1)).toEqual({
      type: 'usage',
      usage: { inputTokens: 3000, outputTokens: 50 },
    });
  });

  it('turns a refusal into a refusal error after what was said', async () => {
    const p = apiProvider({
      env: { ANTHROPIC_API_KEY: 'k' },
      stream: () => streamOf([], 'refusal'),
    });
    const chunks = await collect(p.stream(input, new AbortController().signal));
    expect(chunks.at(-1)).toEqual({ type: 'error', code: 'refusal' });
  });

  it('maps the SDK errors, most specific first', () => {
    const headers = new Headers();
    expect(apiErrorCode(new Anthropic.AuthenticationError(401, {}, 'x', headers))).toBe('auth');
    expect(apiErrorCode(new Anthropic.RateLimitError(429, {}, 'x', headers))).toBe('rate_limit');
    expect(apiErrorCode(new Anthropic.APIError(529, {}, 'x', headers))).toBe('overloaded');
    expect(apiErrorCode(new Anthropic.APIConnectionTimeoutError())).toBe('timeout');
    expect(apiErrorCode(new Anthropic.APIConnectionError({ message: 'x' }))).toBe('network');
    expect(apiErrorCode(new Error('x'))).toBe('unknown');
  });

  it('answers a failure with one error and no retry', async () => {
    const open = vi.fn(() => {
      throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
    });
    const p = apiProvider({ env: { ANTHROPIC_API_KEY: 'k' }, stream: open });
    expect(await collect(p.stream(input, new AbortController().signal))).toEqual([
      { type: 'error', code: 'auth' },
    ]);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('fake provider (test double)', () => {
  it('names the first node and stops on abort', async () => {
    const p = fakeProvider('api', { delayMs: 0 });
    const chunks = await collect(p.stream(input, new AbortController().signal));
    expect(chunks.map((c) => (c.type === 'delta' ? c.text : c.type)).join('')).toContain('n1');
    const controller = new AbortController();
    const slow = p.stream({ ...input, message: 'lento' }, controller.signal);
    const seen: ProviderChunk[] = [];
    for await (const c of slow) {
      seen.push(c);
      controller.abort();
    }
    expect(seen).toHaveLength(1);
  });
});
