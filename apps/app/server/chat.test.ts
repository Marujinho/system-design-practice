// @vitest-environment node
import { catalog } from '@archsim/catalog';
import { Conversation, MentorEvent, MentorStatus } from '@archsim/problems';
import { PROBLEMS_DIR } from '@archsim/problems/load';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProvider } from './mentor/fake-provider';
import type { MentorProvider } from './mentor/provider';
import { createPracticeHandler } from './routes';

let server: Server;
let port: number;
let dir: string;
let logs: string[];
let api: ReturnType<typeof fakeProvider>;
let subscription: ReturnType<typeof fakeProvider>;
const FAKE_KEY = 'sk-ant-chave-falsa-de-teste';

const reference = JSON.parse(
  readFileSync(join(PROBLEMS_DIR, 'url-shortener', 'reference.archsim.json'), 'utf8'),
) as unknown;

function start(providers: MentorProvider[], idleMs?: number): Promise<void> {
  const handler = createPracticeHandler({
    practiceDir: dir,
    problemsDir: PROBLEMS_DIR,
    catalog,
    now: () => new Date('2026-11-14T12:00:00.000Z'),
    log: (line) => logs.push(line),
    mentor: { providers, model: 'claude-opus-5-5', ...(idleMs === undefined ? {} : { idleMs }) },
  });
  server = createServer((req, res) => {
    void handler(req, res, () => {
      res.writeHead(404).end();
    });
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archsim-chat-'));
  logs = [];
  vi.stubEnv('ANTHROPIC_API_KEY', FAKE_KEY);
  api = fakeProvider('api', { delayMs: 1 });
  subscription = fakeProvider('subscription', { available: false });
  await start([subscription, api]);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((done) => {
    server.close(() => {
      done();
    });
    server.closeAllConnections();
  });
});

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string; omitOrigin?: boolean } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      host: `127.0.0.1:${String(port)}`,
      ...(options.omitOrigin ? {} : { origin: `http://127.0.0.1:${String(port)}` }),
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    };
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

const chatBody = (message: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    problemId: 'url-shortener',
    provider: 'api',
    message,
    diagram: reference,
    ...over,
  });

function events(body: string): MentorEvent[] {
  return body
    .split('\n\n')
    .filter((b) => b.trim() !== '')
    .map((b) => {
      const data = b.split('\n').find((l) => l.startsWith('data: '));
      return MentorEvent.parse(JSON.parse(data?.slice(6) ?? 'null'));
    });
}

const saved = () =>
  Conversation.parse(JSON.parse(readFileSync(join(dir, 'mentor-url-shortener.json'), 'utf8')));

describe('mentor status (study-mode FR-6, A07)', () => {
  it('says which providers can answer, without a credential and without calling a model', async () => {
    const r = await call('GET', '/__archsim/mentor/status');
    expect(r.status).toBe(200);
    expect(MentorStatus.parse(JSON.parse(r.body))).toEqual({
      subscription: false,
      api: true,
      model: 'claude-opus-5-5',
    });
    expect(r.body).not.toContain(FAKE_KEY);
    expect(api.calls).toBe(0);
  });
});

describe('chat stream (study-mode FR-4, FR-7, FR-8, FR-13)', () => {
  it('streams the reply as server-sent events and keeps both turns', async () => {
    const r = await call('POST', '/__archsim/chat', { body: chatBody('O que está saturando?') });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    const ev = events(r.body);
    expect(ev[0]).toEqual({ type: 'start' });
    expect(ev.at(-1)).toEqual({ type: 'done', interrupted: false });
    const text = ev.map((e) => (e.type === 'delta' ? e.text : '')).join('');
    expect(text).toContain('n1');
    expect(ev.some((e) => e.type === 'usage')).toBe(true);
    const c = saved();
    expect(c.messages.map((m) => m.role)).toEqual(['user', 'mentor']);
    expect(c.messages[1]).toMatchObject({ provider: 'api', text, usage: { outputTokens: 30 } });
    const back = await call('GET', '/__archsim/conversation/url-shortener');
    expect(Conversation.parse(JSON.parse(back.body))).toEqual(c);
  });

  it('sends a provider error as an event and keeps the conversation as it was', async () => {
    const r = await call('POST', '/__archsim/chat', { body: chatBody('erro:auth') });
    expect(events(r.body)).toContainEqual({ type: 'error', code: 'auth' });
    expect(existsSync(join(dir, 'mentor-url-shortener.json'))).toBe(false);
  });

  it('refuses an unavailable provider, an unknown problem and an invalid diagram before streaming', async () => {
    const unavailable = await call('POST', '/__archsim/chat', {
      body: chatBody('oi', { provider: 'subscription' }),
    });
    expect(unavailable.status).toBe(409);
    expect(
      (await call('POST', '/__archsim/chat', { body: chatBody('oi', { problemId: 'nope' }) }))
        .status,
    ).toBe(404);
    expect(
      (await call('POST', '/__archsim/chat', { body: chatBody('oi', { diagram: { nodes: 'x' } }) }))
        .status,
    ).toBe(400);
    expect(subscription.calls + api.calls).toBe(0);
  });

  it('clears the conversation with DELETE', async () => {
    await call('POST', '/__archsim/chat', { body: chatBody('oi') });
    const r = await call('DELETE', '/__archsim/conversation/url-shortener');
    expect(r.status).toBe(204);
    expect(existsSync(join(dir, 'mentor-url-shortener.json'))).toBe(false);
  });
});

describe('A01: only the app may chat or clear', () => {
  it('refuses another origin, a foreign host, and a DELETE without Origin', async () => {
    const evil = { origin: 'https://evil.example' };
    expect(
      (await call('POST', '/__archsim/chat', { body: chatBody('oi'), headers: evil })).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/__archsim/chat', {
          body: chatBody('oi'),
          headers: { host: 'evil.example' },
        })
      ).status,
    ).toBe(403);
    await call('POST', '/__archsim/chat', { body: chatBody('oi') });
    expect(
      (await call('DELETE', '/__archsim/conversation/url-shortener', { omitOrigin: true })).status,
    ).toBe(403);
    expect(existsSync(join(dir, 'mentor-url-shortener.json'))).toBe(true);
    expect(api.calls).toBe(1);
  });

  it('refuses a path-like id and writes nothing outside practice/', async () => {
    expect((await call('GET', '/__archsim/conversation/..%2F..%2Fetc')).status).toBe(404);
    expect((await call('DELETE', '/__archsim/conversation/..')).status).toBe(404);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('A06: limits', () => {
  it('refuses a question over 8000 characters with 413', async () => {
    const r = await call('POST', '/__archsim/chat', { body: chatBody('x'.repeat(8001)) });
    expect(r.status).toBe(413);
    expect(api.calls).toBe(0);
  });

  it('refuses a second question while a reply is still streaming (409)', async () => {
    const first = new Promise<void>((resolve) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/__archsim/chat',
          headers: {
            host: `127.0.0.1:${String(port)}`,
            origin: `http://127.0.0.1:${String(port)}`,
            'content-type': 'application/json',
          },
        },
        (res) => {
          res.once('data', () => {
            resolve();
          });
        },
      );
      req.end(chatBody('lento'));
    });
    await first;
    const second = await call('POST', '/__archsim/chat', { body: chatBody('oi') });
    expect(second.status).toBe(409);
    expect(JSON.parse(second.body)).toEqual({ error: 'já há uma resposta em andamento' });
  });
});

describe('review fixes: clearing mid-reply, thinking, very long replies', () => {
  async function restart(providers: MentorProvider[], idleMs?: number) {
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
      server.closeAllConnections();
    });
    await start(providers, idleMs);
  }

  function openStream(message: string): Promise<void> {
    return new Promise((resolve) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/__archsim/chat',
          headers: {
            host: `127.0.0.1:${String(port)}`,
            origin: `http://127.0.0.1:${String(port)}`,
            'content-type': 'application/json',
          },
        },
        (res) => {
          res.once('data', () => {
            resolve();
          });
        },
      );
      req.end(chatBody(message));
    });
  }

  it('refuses to clear a conversation while a reply is streaming (409)', async () => {
    await openStream('lento');
    const r = await call('DELETE', '/__archsim/conversation/url-shortener');
    expect(r.status).toBe(409);
  });

  it('keeps a reply alive while the model thinks longer than the idle limit', async () => {
    const thinker: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream() {
        for (let i = 0; i < 6; i += 1) {
          await new Promise((r) => setTimeout(r, 20));
          yield { type: 'heartbeat' };
        }
        yield { type: 'delta', text: 'pensei' };
      },
    };
    await restart([thinker], 50);
    const ev = events((await call('POST', '/__archsim/chat', { body: chatBody('oi') })).body);
    expect(ev).toContainEqual({ type: 'delta', text: 'pensei' });
    expect(ev.some((e) => e.type === 'error')).toBe(false);
    expect(JSON.stringify(ev)).not.toContain('heartbeat');
  });

  it('cuts a reply at what a conversation file holds and keeps it, interrupted', async () => {
    let seen: AbortSignal | undefined;
    const talker: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream(_i, signal) {
        seen = signal;
        for (let i = 0; i < 30 && !signal.aborted; i += 1) {
          await Promise.resolve();
          yield { type: 'delta', text: 'x'.repeat(5000) };
        }
      },
    };
    await restart([talker]);
    const ev = events((await call('POST', '/__archsim/chat', { body: chatBody('oi') })).body);
    const text = ev.map((e) => (e.type === 'delta' ? e.text : '')).join('');
    expect(text).toHaveLength(100_000);
    expect(ev.at(-1)).toEqual({ type: 'done', interrupted: true });
    expect(seen?.aborted).toBe(true);
    expect(saved().messages[1]).toMatchObject({ interrupted: true });
  });
});

describe('proposals (mentor-edits FR-1, FR-6, FR-9, A01, A08, A09, A10)', () => {
  async function restart(providers: MentorProvider[]) {
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
      server.closeAllConnections();
    });
    await start(providers);
  }
  const proposer = (input: unknown): MentorProvider => ({
    id: 'api',
    available: () => Promise.resolve(true),
    async *stream() {
      await Promise.resolve();
      yield { type: 'delta', text: 'Proponho. ' };
      yield { type: 'proposal', input };
    },
  });
  const status = (proposalId: string, s: string, headers: Record<string, string> = {}) =>
    call('POST', '/__archsim/proposal', {
      body: JSON.stringify({ problemId: 'url-shortener', proposalId, status: s }),
      headers,
    });

  it('validates a proposal against the diagram the mentor saw and sends it with real ids', async () => {
    const r = await call('POST', '/__archsim/chat', { body: chatBody('proponha:ec2') });
    const ev = events(r.body);
    const p = ev.find((e) => e.type === 'proposal');
    if (p?.type !== 'proposal') throw new Error('sem proposta');
    expect(p.proposal.status).toBe('pending');
    expect(p.proposal.ops).toEqual([
      { op: 'add', ref: 'novo1', service: 'aws.ec2', label: 'API' },
      { op: 'connect', from: 'users', to: 'novo1' },
    ]);
    expect(saved().messages[1]).toMatchObject({ role: 'mentor', proposal: { id: p.proposal.id } });
    expect(logs.find((l) => l.includes('mentor problema='))).toMatch(/propostas=1 rejeitadas=0$/);
    expect(logs.join('\n')).not.toContain('API atrás dos Usuários');
  });

  it('rejects a proposal the simulator would not accept, and keeps the text', async () => {
    const r = await call('POST', '/__archsim/chat', { body: chatBody('proponha:invalida') });
    const ev = events(r.body);
    expect(ev.find((e) => e.type === 'proposal_rejected')).toMatchObject({
      reason: expect.stringContaining('serviço desconhecido') as unknown,
    });
    expect(ev.some((e) => e.type === 'proposal')).toBe(false);
    expect(saved().messages[1]).not.toHaveProperty('proposal');
    expect(logs.find((l) => l.includes('mentor problema='))).toMatch(/propostas=0 rejeitadas=1$/);
  });

  it('never takes an id the mentor did not see, nor a real one it guessed', async () => {
    for (const node of ['users', 'n99', 'app']) {
      await restart([proposer({ summary: 's', ops: [{ op: 'rename', node, label: 'X' }] })]);
      const ev = events((await call('POST', '/__archsim/chat', { body: chatBody('oi') })).body);
      expect(
        ev.some((e) => e.type === 'proposal_rejected'),
        node,
      ).toBe(true);
    }
    await restart([proposer({ summary: 's', ops: [{ op: 'set_load', rps: 9 }] })]);
    const ev = events((await call('POST', '/__archsim/chat', { body: chatBody('oi') })).body);
    expect(ev.find((e) => e.type === 'proposal_rejected')).toMatchObject({
      reason: 'a proposta não segue o formato esperado',
    });
  });

  it('keeps a proposal on a node whose id came from an imported file (review M3)', async () => {
    const imported = JSON.parse(JSON.stringify(reference)) as {
      nodes: { id: string }[];
      edges: { source: string; target: string }[];
    };
    const rename = (from: string, to: string) => {
      for (const n of imported.nodes) if (n.id === from) n.id = to;
      for (const e of imported.edges) {
        if (e.source === from) e.source = to;
        if (e.target === from) e.target = to;
      }
    };
    rename('app', 'API_GW');
    await restart([
      proposer({ summary: 's', ops: [{ op: 'set_prop', node: 'n3', key: 'units', value: 2 }] }),
    ]);
    const ev = events(
      (await call('POST', '/__archsim/chat', { body: chatBody('oi', { diagram: imported }) })).body,
    );
    const p = ev.find((e) => e.type === 'proposal');
    if (p?.type !== 'proposal') throw new Error(JSON.stringify(ev));
    expect(p.proposal.ops).toEqual([{ op: 'set_prop', node: 'API_GW', key: 'units', value: 2 }]);
    expect(saved().messages).toHaveLength(2);
  });

  it('tells the API provider why the simulator refused, through check (review M5)', async () => {
    let seen: string | null | undefined;
    const checker: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream(input) {
        await Promise.resolve();
        seen = input.check?.({
          summary: 's',
          ops: [{ op: 'add', ref: 'novo1', service: 'aws.nope' }],
        });
        yield { type: 'delta', text: 'ok' };
      },
    };
    await restart([checker]);
    await call('POST', '/__archsim/chat', { body: chatBody('oi') });
    expect(seen).toContain('serviço desconhecido');
  });

  it('keeps the corrected proposal when the first one was refused (feedback FR-3)', async () => {
    const twice: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream() {
        await Promise.resolve();
        yield {
          type: 'proposal',
          input: { summary: 's', ops: [{ op: 'add', ref: 'novo1', service: 'aws.nope' }] },
        };
        yield {
          type: 'proposal',
          input: { summary: 's', ops: [{ op: 'set_prop', node: 'n3', key: 'units', value: 2 }] },
        };
        yield { type: 'delta', text: 'Corrigi.' };
      },
    };
    await restart([twice]);
    const ev = events((await call('POST', '/__archsim/chat', { body: chatBody('oi') })).body);
    // decided at the end of the reply: the valid one, no warning for the refused one
    expect(ev.map((e) => e.type)).toEqual(['start', 'delta', 'proposal', 'done']);
    expect(saved().messages[1]).toMatchObject({
      proposal: { ops: [{ op: 'set_prop', node: 'app', key: 'units', value: 2 }] },
    });
  });

  it('decides with the check the provider asked: later valid proposals are told they do not count (review M2)', async () => {
    const answers: (string | null)[] = [];
    const asker: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream(input) {
        await Promise.resolve();
        const first = {
          summary: 'a',
          ops: [{ op: 'set_prop', node: 'n3', key: 'units', value: 2 }],
        };
        const second = {
          summary: 'b',
          ops: [{ op: 'set_prop', node: 'n3', key: 'units', value: 3 }],
        };
        answers.push(input.check?.(first) ?? null, input.check?.(second) ?? null);
        yield { type: 'proposal', input: first };
        yield { type: 'proposal', input: second };
        yield { type: 'delta', text: 'ok' };
      },
    };
    await restart([asker]);
    const ev = events((await call('POST', '/__archsim/chat', { body: chatBody('oi') })).body);
    expect(answers[0]).toBeNull();
    expect(answers[1]).toContain('já há uma proposta registrada');
    expect(ev.find((e) => e.type === 'proposal')).toMatchObject({ proposal: { summary: 'a' } });
    expect(ev.filter((e) => e.type === 'proposal')).toHaveLength(1);
  });

  it('ignores a proposal the provider never got validated, once it asks for others (review M2)', async () => {
    const partial: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream(input) {
        await Promise.resolve();
        const refused = { summary: 'x', ops: [{ op: 'add', ref: 'novo1', service: 'aws.nope' }] };
        input.check?.(refused);
        yield { type: 'proposal', input: refused };
        // a call the model was told could not be validated: never checked, never a card
        yield {
          type: 'proposal',
          input: { summary: 'y', ops: [{ op: 'set_prop', node: 'n3', key: 'units', value: 2 }] },
        };
        yield { type: 'delta', text: 'ok' };
      },
    };
    await restart([partial]);
    const ev = events((await call('POST', '/__archsim/chat', { body: chatBody('oi') })).body);
    expect(ev.some((e) => e.type === 'proposal')).toBe(false);
    expect(ev.find((e) => e.type === 'proposal_rejected')).toMatchObject({
      reason: expect.stringContaining('serviço desconhecido') as unknown,
    });
  });

  it('drops the proposal of an interrupted reply', async () => {
    const slow: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream(_i, signal) {
        yield { type: 'delta', text: 'Proponho. ' };
        yield {
          type: 'proposal',
          input: { summary: 's', ops: [{ op: 'set_prop', node: 'n3', key: 'units', value: 2 }] },
        };
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            resolve();
          });
        });
      },
    };
    await restart([slow]);
    await new Promise<void>((resolve) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/__archsim/chat',
          headers: {
            host: `127.0.0.1:${String(port)}`,
            origin: `http://127.0.0.1:${String(port)}`,
            'content-type': 'application/json',
          },
        },
        (res) => {
          let seen = '';
          res.on('data', (c: Buffer) => {
            seen += c.toString();
            if (seen.includes('event: delta')) {
              req.destroy();
              resolve();
            }
          });
        },
      );
      req.on('error', () => undefined);
      req.end(chatBody('oi'));
    });
    await vi.waitFor(() => {
      expect(existsSync(join(dir, 'mentor-url-shortener.json'))).toBe(true);
    });
    expect(saved().messages[1]).toMatchObject({ interrupted: true });
    expect(saved().messages[1]).not.toHaveProperty('proposal');
  });

  it('keeps the status the person chose, with the allowed transitions only', async () => {
    const ev = events(
      (await call('POST', '/__archsim/chat', { body: chatBody('proponha:ec2') })).body,
    );
    const p = ev.find((e) => e.type === 'proposal');
    if (p?.type !== 'proposal') throw new Error('sem proposta');
    const id = p.proposal.id;
    expect((await status(id, 'applied')).status).toBe(200);
    expect(saved().messages[1]).toMatchObject({ proposal: { status: 'applied' } });
    expect((await status(id, 'discarded')).status).toBe(409);
    expect((await status(id, 'pending')).status).toBe(200);
    expect((await status(id, 'discarded')).status).toBe(200);
    expect((await status(id, 'applied')).status).toBe(409);
    expect((await status('0b6c1f9e-6b1a-4a5f-9a7e-0c2b1d3e4f50', 'applied')).status).toBe(404);
  });

  it('refuses a status change from another origin or without Origin (A01)', async () => {
    const ev = events(
      (await call('POST', '/__archsim/chat', { body: chatBody('proponha:ec2') })).body,
    );
    const p = ev.find((e) => e.type === 'proposal');
    if (p?.type !== 'proposal') throw new Error('sem proposta');
    expect(
      (await status(p.proposal.id, 'applied', { origin: 'https://evil.example' })).status,
    ).toBe(403);
    const noOrigin = await call('POST', '/__archsim/proposal', {
      body: JSON.stringify({
        problemId: 'url-shortener',
        proposalId: p.proposal.id,
        status: 'applied',
      }),
      omitOrigin: true,
    });
    expect(noOrigin.status).toBe(403);
    expect(saved().messages[1]).toMatchObject({ proposal: { status: 'pending' } });
  });
});

describe('A10: stop, disconnect, time out', () => {
  it('aborts the provider when the browser goes away and keeps what was said, marked interrupted', async () => {
    let signal: AbortSignal | undefined;
    const slow: MentorProvider = {
      id: 'api',
      available: () => Promise.resolve(true),
      async *stream(_input, s) {
        signal = s;
        yield { type: 'delta', text: 'Começando' };
        await new Promise<void>((resolve) => {
          s.addEventListener('abort', () => {
            resolve();
          });
        });
      },
    };
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
      server.closeAllConnections();
    });
    await start([slow]);
    await new Promise<void>((resolve) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/__archsim/chat',
          headers: {
            host: `127.0.0.1:${String(port)}`,
            origin: `http://127.0.0.1:${String(port)}`,
            'content-type': 'application/json',
          },
        },
        (res) => {
          res.once('data', () => {
            req.destroy();
            resolve();
          });
        },
      );
      req.on('error', () => undefined);
      req.end(chatBody('oi'));
    });
    await vi.waitFor(() => {
      expect(signal?.aborted).toBe(true);
      expect(existsSync(join(dir, 'mentor-url-shortener.json'))).toBe(true);
    });
    expect(saved().messages[1]).toMatchObject({ text: 'Começando', interrupted: true });
    await vi.waitFor(() => {
      expect(logs.some((l) => l.includes('status=abortado'))).toBe(true);
    });
  });

  it('cuts a reply that stops arriving with a timeout error', async () => {
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
      server.closeAllConnections();
    });
    await start([fakeProvider('api')], 50);
    const r = await call('POST', '/__archsim/chat', { body: chatBody('trava') });
    const ev = events(r.body);
    expect(ev).toContainEqual({ type: 'error', code: 'timeout' });
    expect(ev.at(-1)).toEqual({ type: 'done', interrupted: true });
  });
});

describe('A09 / A04: what the log and the disk keep', () => {
  it('logs one line per reply, without the question, the answer or the key', async () => {
    const question = 'pergunta-secreta-que-nao-pode-ir-para-o-log';
    await call('POST', '/__archsim/chat', { body: chatBody(question) });
    const line = logs.find((l) => l.includes('mentor problema='));
    expect(line).toMatch(
      /^\[archsim\] mentor problema=url-shortener provedor=api status=ok ttft_ms=\d+ in=1200 out=30 propostas=0 rejeitadas=0$/,
    );
    expect(logs.join('\n')).not.toContain(question);
    expect(logs.join('\n')).not.toContain('Olhando o desenho');
    expect(logs.join('\n')).not.toContain(FAKE_KEY);
    for (const f of readdirSync(dir)) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toContain(FAKE_KEY);
    }
  });
});

vi.setConfig({ testTimeout: 20_000 });
