import type { MentorErrorCode } from '@archsim/problems';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { writeAtomic } from '../atomic-write';
import { mcpServerSource } from './mcp-server';
import { MCP_SERVER_NAME, MCP_TOOL_NAME, toolInputSchema } from './proposal-tool';
import {
  CREDENTIAL_VARS,
  transcript,
  type MentorProvider,
  type ProviderChunk,
  type ProviderInput,
} from './provider';

/**
 * The person's own Claude subscription, through the `claude` they already have
 * installed and logged in — the unmodified Claude Code binary, in print mode.
 * Verified on 2.1.325: these flags start a session with no tools, no MCP
 * servers, no slash commands or skills, and no settings or CLAUDE.md
 * (study-mode FR-12, A02).
 */
export function cliArgs(model: string, systemFile: string, mcpConfig: string): string[] {
  return [
    '-p',
    '--tools',
    '',
    // One MCP server of ours with one tool; built-in tools stay off (mentor-edits A02).
    '--mcp-config',
    mcpConfig,
    '--allowedTools',
    MCP_TOOL_NAME,
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
    // The tool call, its result, and the closing text.
    '--max-turns',
    '5',
    '--model',
    model,
    '--effort',
    'medium',
    '--system-prompt-file',
    systemFile,
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
  ];
}

/** The environment without API credentials, so `claude` uses the subscription login (A04). */
export function subscriptionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of CREDENTIAL_VARS) Reflect.deleteProperty(out, k);
  return out;
}

/** `claude auth status --json`, reduced to one boolean on the spot: it also carries email and org. */
export function loggedInWithSubscription(json: string): boolean {
  try {
    const status = JSON.parse(json) as { loggedIn?: unknown; authMethod?: unknown };
    return status.loggedIn === true && status.authMethod === 'claude.ai';
  } catch {
    return false;
  }
}

function errorFromStatus(status: unknown): MentorErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 529 || status === 503) return 'overloaded';
  return 'unknown';
}

/** One stream-json line → what the chat needs from it; any other event is only a sign of life. */
export function chunkOf(line: string): ProviderChunk | 'result' | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (m.type === 'stream_event') {
    const e = m.event as { type?: unknown; delta?: { type?: unknown; text?: unknown } } | undefined;
    if (
      e?.type === 'content_block_delta' &&
      e.delta?.type === 'text_delta' &&
      typeof e.delta.text === 'string'
    )
      return { type: 'delta', text: e.delta.text };
    return { type: 'heartbeat' };
  }
  if (m.type === 'assistant') {
    const content = (m.message as { content?: unknown } | undefined)?.content;
    const call = Array.isArray(content)
      ? (content as { type?: unknown; name?: unknown; input?: unknown }[]).find(
          (b) => b.type === 'tool_use' && b.name === MCP_TOOL_NAME,
        )
      : undefined;
    return call ? { type: 'proposal', input: call.input } : { type: 'heartbeat' };
  }
  if (m.type === 'result') {
    if (m.is_error === true) return { type: 'error', code: errorFromStatus(m.api_error_status) };
    return 'result';
  }
  return { type: 'heartbeat' };
}

function usageOf(line: string): ProviderChunk | null {
  const m = JSON.parse(line) as {
    usage?: Record<string, unknown>;
    total_cost_usd?: unknown;
  };
  const u = m.usage ?? {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
  const inputTokens =
    n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens);
  return {
    type: 'usage',
    usage: {
      inputTokens,
      outputTokens: n(u.output_tokens),
      ...(typeof m.total_cost_usd === 'number' ? { costUsd: m.total_cost_usd } : {}),
    },
  };
}

/**
 * The private channel the MCP process uses to ask whether a proposal holds up,
 * with the route's own validation (feedback FR-2). A Unix socket inside the
 * 0700 directory, one per reply: nothing on a port, nothing the browser reaches.
 * It only answers ok or the reason; it never applies or stores anything.
 */
/** A proposal is at most 50 short operations; anything near this is not one. */
const VALIDATOR_MAX_BYTES = 256 * 1024;

export function openValidator(socketPath: string, check: ProviderInput['check']): Promise<Server> {
  const server = createServer((conn) => {
    let buf = '';
    let answered = false;
    conn.setEncoding('utf8'); // a multibyte character split across chunks stays whole
    conn.on('error', () => undefined);
    conn.on('data', (d: string) => {
      if (answered) return; // one question per connection
      buf += d;
      if (buf.length > VALIDATOR_MAX_BYTES) {
        answered = true;
        conn.end(`${JSON.stringify({ ok: false, reason: 'proposta grande demais' })}\n`);
        return;
      }
      const i = buf.indexOf('\n');
      if (i < 0) return;
      answered = true;
      let reason: string | null;
      try {
        const { input } = JSON.parse(buf.slice(0, i)) as { input?: unknown };
        reason = check?.(input) ?? null;
      } catch {
        reason = 'não consegui ler a proposta';
      }
      conn.end(`${JSON.stringify(reason === null ? { ok: true } : { ok: false, reason })}\n`);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      resolve(server);
    });
  });
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams;

export type ExecFn = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number },
) => Promise<string>;

const defaultExec: ExecFn = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { ...options, encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(new Error('claude auth status falhou', { cause: error }));
      else resolve(stdout);
    });
  });

const STATUS_TTL_MS = 60_000;

export function cliProvider(
  options: {
    env?: NodeJS.ProcessEnv;
    spawn?: SpawnFn;
    exec?: ExecFn;
    /**
     * The working directory: empty, so no CLAUDE.md or AGENTS.md. By default a private one
     * (mkdtemp, mode 0700) created once per server, never a predictable shared path.
     */
    cwd?: string;
    now?: () => number;
  } = {},
): MentorProvider {
  const env = subscriptionEnv(options.env ?? process.env);
  const run = options.spawn ?? ((c, a, o) => spawn(c, a, { ...o, stdio: 'pipe' }));
  const exec = options.exec ?? defaultExec;
  let dir: string | null = null;
  const workDir = (): string => {
    if (dir !== null) return dir;
    if (options.cwd === undefined) dir = mkdtempSync(join(tmpdir(), 'archsim-mentor-'));
    else {
      mkdirSync(options.cwd, { recursive: true, mode: 0o700 });
      dir = options.cwd;
    }
    return dir;
  };
  const now = options.now ?? Date.now;
  let cached: { at: number; value: boolean } | null = null;

  return {
    id: 'subscription',
    async available() {
      if (cached && now() - cached.at < STATUS_TTL_MS) return cached.value;
      let value: boolean;
      try {
        value = loggedInWithSubscription(
          await exec('claude', ['auth', 'status', '--json'], { env, timeout: 5000 }),
        );
      } catch {
        value = false; // not installed (ENOENT), timed out, or not logged in
      }
      cached = { at: now(), value };
      return value;
    },
    async *stream(input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderChunk> {
      const cwd = workDir();
      // One file per reply: two problems asked at once never read each other's prompt.
      const systemFile = `system-${randomUUID()}.txt`;
      const mcpFile = join(cwd, `mcp-${randomUUID()}.mjs`);
      // Short name: a Unix socket path is limited to ~104 characters on macOS.
      const socketPath = join(cwd, `c-${randomBytes(4).toString('hex')}.sock`);
      let validator: Server | null = null;
      // Cleanup is ready before the first write, so a failed write leaves nothing behind.
      const removeSystem = () => {
        rmSync(join(cwd, systemFile), { force: true });
        rmSync(mcpFile, { force: true });
        validator?.close();
        rmSync(socketPath, { force: true });
      };
      try {
        writeAtomic(join(cwd, systemFile), input.system);
        validator = await openValidator(socketPath, input.check);
        writeAtomic(mcpFile, mcpServerSource(toolInputSchema(), socketPath));
      } catch {
        removeSystem();
        yield { type: 'error', code: 'unknown' };
        return;
      }
      const mcpConfig = JSON.stringify({
        mcpServers: { [MCP_SERVER_NAME]: { command: process.execPath, args: [mcpFile] } },
      });
      let child: ChildProcessWithoutNullStreams;
      try {
        child = run('claude', cliArgs(input.model, systemFile, mcpConfig), { cwd, env });
      } catch {
        removeSystem();
        yield { type: 'error', code: 'unknown' };
        return;
      }
      const kill = () => child.kill('SIGTERM');
      signal.addEventListener('abort', kill, { once: true });
      // A failed spawn (claude not installed) also closes with a non-zero code; this only keeps
      // the 'error' event from crashing the server.
      child.on('error', () => undefined);
      const exited = new Promise<number | null>((resolve) => {
        child.on('close', (code) => {
          resolve(code);
        });
      });
      child.stderr.resume(); // drained, never logged: it can echo the prompt
      const prompt = [transcript(input.history), input.state, `[pessoa]\n${input.message}`]
        .filter((p) => p !== '')
        .join('\n\n');
      child.stdin.on('error', () => undefined);
      child.stdin.end(prompt);

      let sawResult = false;
      try {
        for await (const line of createInterface({ input: child.stdout })) {
          const c = chunkOf(line);
          if (c === null) continue;
          if (c === 'result') {
            sawResult = true;
            const u = usageOf(line);
            if (u) yield u;
          } else {
            if (c.type === 'error') sawResult = true;
            yield c;
          }
        }
        await exited;
        // No result line means no answer, whatever the exit code says.
        if (!signal.aborted && !sawResult) yield { type: 'error', code: 'unknown' };
      } finally {
        signal.removeEventListener('abort', kill);
        if (child.exitCode === null) kill();
        removeSystem();
      }
    },
  };
}
