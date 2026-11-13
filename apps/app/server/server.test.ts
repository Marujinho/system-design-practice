// @vitest-environment node
import { catalog } from '@archsim/catalog';
import { FinalizeResponse, History, ProblemSummary, Session } from '@archsim/problems';
import { PROBLEMS_DIR } from '@archsim/problems/load';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeAtomic } from './atomic-write';
import { createPracticeHandler } from './routes';

let server: Server;
let port: number;
let dir: string;
let logs: string[];

const reference = JSON.parse(
  readFileSync(join(PROBLEMS_DIR, 'url-shortener', 'reference.archsim.json'), 'utf8'),
) as unknown;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'archsim-practice-'));
  logs = [];
  const handler = createPracticeHandler({
    practiceDir: dir,
    problemsDir: PROBLEMS_DIR,
    catalog,
    now: () => new Date('2026-11-13T12:00:00.000Z'),
    log: (line) => logs.push(line),
  });
  server = createServer((req, res) => {
    void handler(req, res, () => {
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>((done) =>
    server.close(() => {
      done();
    }),
  );
});

interface Reply {
  status: number;
  body: string;
}

function call(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string; omitOrigin?: boolean } = {},
): Promise<Reply> {
  const origin = `http://127.0.0.1:${port}`;
  const headers: Record<string, string> = {
    host: `127.0.0.1:${port}`,
    ...(options.omitOrigin ? {} : { origin }),
    ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    ...options.headers,
  };
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => {
        done({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', fail);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

const finalizeBody = (diagram: unknown = reference, problemId = 'url-shortener') =>
  JSON.stringify({ problemId, diagram });

describe('A01: only the app may call', () => {
  it('refuses a POST from another origin and leaves the session untouched', async () => {
    const r = await call('POST', '/__archsim/finalize', {
      headers: { origin: 'https://evil.example' },
      body: finalizeBody(),
    });
    expect(r.status).toBe(403);
    expect(existsSync(join(dir, 'session.json'))).toBe(false);
  });

  it('refuses a foreign Host (DNS rebinding)', async () => {
    const r = await call('POST', '/__archsim/finalize', {
      headers: { host: 'evil.example' },
      body: finalizeBody(),
    });
    expect(r.status).toBe(403);
  });

  it('refuses a POST without Origin', async () => {
    const r = await call('POST', '/__archsim/finalize', { omitOrigin: true, body: finalizeBody() });
    expect(r.status).toBe(403);
  });

  it('refuses a GET that is not same-origin', async () => {
    const r = await call('GET', '/__archsim/problems', { omitOrigin: true });
    expect(r.status).toBe(403);
    const ok = await call('GET', '/__archsim/problems', {
      omitOrigin: true,
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(ok.status).toBe(200);
  });

  it('accepts localhost as well as 127.0.0.1', async () => {
    const r = await call('GET', '/__archsim/history', {
      headers: { host: `localhost:${port}`, origin: `http://localhost:${port}` },
    });
    expect(r.status).toBe(200);
  });
});

describe('A02: method and content type', () => {
  it('GET /finalize → 405', async () => {
    expect((await call('GET', '/__archsim/finalize')).status).toBe(405);
  });

  it('text/plain → 415', async () => {
    const r = await call('POST', '/__archsim/finalize', {
      headers: { 'content-type': 'text/plain' },
      body: finalizeBody(),
    });
    expect(r.status).toBe(415);
  });

  it('POST /history → 405', async () => {
    expect((await call('POST', '/__archsim/history', { body: '{}' })).status).toBe(405);
  });

  it('passes other paths through to the app', async () => {
    expect((await call('GET', '/index.html')).status).toBe(404);
  });
});

describe('A05: no paths from the client', () => {
  it('refuses a problem id that looks like a path', async () => {
    const r = await call('POST', '/__archsim/finalize', {
      body: finalizeBody(reference, '../../etc'),
    });
    expect(r.status).toBe(404);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('ignores any path field in the body: only practice/session.json is written', async () => {
    const r = await call('POST', '/__archsim/finalize', {
      body: JSON.stringify({
        problemId: 'url-shortener',
        diagram: reference,
        path: '../../.ssh/x',
      }),
    });
    expect(r.status).toBe(200);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'session.json']);
  });
});

describe('A06: size and the hidden reference', () => {
  it('refuses a body over 5 MB', async () => {
    const r = await call('POST', '/__archsim/finalize', {
      body: `{"pad":"${'x'.repeat(5 * 1024 * 1024)}"}`,
    });
    expect(r.status).toBe(413);
  });

  it('keeps the reference behind the first finalization', async () => {
    expect((await call('GET', '/__archsim/reference/url-shortener')).status).toBe(403);
    await call('POST', '/__archsim/finalize', { body: finalizeBody() });
    const r = await call('GET', '/__archsim/reference/url-shortener');
    expect(r.status).toBe(200);
    expect(
      History.parse(JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8'))).solutionViewedAt,
    ).toEqual({
      'url-shortener': '2026-11-13T12:00:00.000Z',
    });
  });

  it('serves problems without follow-ups or scoring', async () => {
    const r = await call('GET', '/__archsim/problems/url-shortener');
    expect(r.body).not.toContain('followups');
    expect(r.body).not.toContain('lookFor');
    const list = (JSON.parse((await call('GET', '/__archsim/problems')).body) as unknown[]).map(
      (x) => ProblemSummary.parse(x),
    );
    expect(list).toHaveLength(10);
  });
});

describe('A08: validated before anything is written', () => {
  it('an invalid diagram → 400 and the previous session stays', async () => {
    await call('POST', '/__archsim/finalize', { body: finalizeBody() });
    const before = readFileSync(join(dir, 'session.json'), 'utf8');
    const r = await call('POST', '/__archsim/finalize', {
      body: finalizeBody({ schemaVersion: 1, nodes: 'x' }),
    });
    expect(r.status).toBe(400);
    expect(readFileSync(join(dir, 'session.json'), 'utf8')).toBe(before);
  });

  it('a corrupted history is set aside and the server keeps working', async () => {
    writeFileSync(join(dir, 'history.json'), '{ not json');
    const r = await call('GET', '/__archsim/history');
    expect(r.status).toBe(200);
    expect(readdirSync(dir).some((f) => f.startsWith('history.corrupt-'))).toBe(true);
  });
});

describe('A09: refusals are logged without the body', () => {
  it('logs method, origin and reason, never the body', async () => {
    await call('POST', '/__archsim/finalize', {
      headers: { origin: 'https://evil.example' },
      body: JSON.stringify({
        problemId: 'url-shortener',
        diagram: reference,
        secret: 'segredo-do-corpo',
      }),
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('https://evil.example');
    expect(logs[0]).toContain('origem não permitida');
    expect(logs[0]).not.toContain('segredo-do-corpo');
  });
});

describe('A10: atomic writes', () => {
  it('a failed rename keeps the previous file valid and leaves no temp file', () => {
    const path = join(dir, 'session.json');
    writeFileSync(path, '{"old":true}');
    expect(() => {
      writeAtomic(path, '{"new":true}', {
        rename: () => {
          throw new Error('disco cheio');
        },
      });
    }).toThrow('disco cheio');
    expect(readFileSync(path, 'utf8')).toBe('{"old":true}');
    expect(readdirSync(dir)).toEqual(['session.json']);
  });
});

describe('finalize (FR-47, FR-59)', () => {
  it('writes a schema-valid session with the diagram and answers the score', async () => {
    const r = await call('POST', '/__archsim/finalize', { body: finalizeBody() });
    expect(r.status).toBe(200);
    const answer = FinalizeResponse.parse(JSON.parse(r.body));
    expect(answer.score.total).toBeGreaterThanOrEqual(90);
    expect(answer.isRecord).toBe(true);
    const session = Session.parse(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')));
    expect(session.status).toBe('ready');
    expect(session.diagram.nodes).toEqual((reference as { nodes: unknown }).nodes);
  });

  it('keeps the best score as record and ignores attempts after the solution was seen', async () => {
    const weak = JSON.parse(JSON.stringify(reference)) as {
      nodes: { id: string; props: Record<string, number> }[];
    };
    const app = weak.nodes.find((n) => n.id === 'app');
    if (app) app.props.units = 25;
    await call('POST', '/__archsim/finalize', { body: finalizeBody(weak) });
    const best = FinalizeResponse.parse(
      JSON.parse((await call('POST', '/__archsim/finalize', { body: finalizeBody() })).body),
    );
    expect(best.isRecord).toBe(true);
    await call('GET', '/__archsim/reference/url-shortener');
    const after = FinalizeResponse.parse(
      JSON.parse((await call('POST', '/__archsim/finalize', { body: finalizeBody() })).body),
    );
    expect(after.score.solutionSeen).toBe(true);
    expect(after.isRecord).toBe(false);
    const list = (JSON.parse((await call('GET', '/__archsim/problems')).body) as unknown[]).map(
      (x) => ProblemSummary.parse(x),
    );
    const row = list.find((p) => p.id === 'url-shortener');
    expect(row?.record).toBe(best.score.total);
    expect(row?.attempts).toBe(3);
  });
});

describe('FR-54: attempts stay out of git', () => {
  it('ignores practice/session.json and history.json', () => {
    const root = join(PROBLEMS_DIR, '..');
    const out = execFileSync(
      'git',
      ['check-ignore', 'practice/session.json', 'practice/history.json'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(out.trim().split('\n')).toEqual(['practice/session.json', 'practice/history.json']);
  });
});

vi.setConfig({ testTimeout: 20_000 });
