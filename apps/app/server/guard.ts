import type { IncomingMessage, ServerResponse } from 'node:http';

export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const PREFIX = '/__archsim/';

export class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

export function clean(value: string | undefined): string {
  return (value ?? '-').replace(/[^\x20-\x7e]/g, '?').slice(0, 200);
}

/** One line per refused request: method, path, origin and reason; never the body (PRD §12 A09). */
export function logRefusal(
  req: IncomingMessage,
  refusal: Refusal,
  log: (line: string) => void = console.warn,
): void {
  log(
    `[archsim] recusado ${clean(req.method)} ${clean(req.url)} origem=${clean(req.headers.origin)} ` +
      `host=${clean(req.headers.host)} motivo=${refusal.reason}`,
  );
}

function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

function allowedOrigins(port: number): Set<string> {
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}

/**
 * Only the app itself may call: Host is this server on loopback (DNS
 * rebinding), and a POST carries this server's Origin (CSRF from any other
 * page open in the browser). A GET must come from the same origin as well
 * (PRD §12 A01, A02).
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function checkCaller(req: IncomingMessage, port: number): void {
  // Headers can be forged by non-browser clients; the peer address cannot (e.g. `pnpm dev --host`).
  if (!LOOPBACK.has(req.socket.remoteAddress ?? ''))
    throw new Refusal(403, 'cliente fora do loopback');
  const host = req.headers.host ?? '';
  if (!allowedHosts(port).has(host)) throw new Refusal(403, 'host não permitido');
  const origin = req.headers.origin;
  if (req.method === 'POST') {
    if (origin === undefined || !allowedOrigins(port).has(origin))
      throw new Refusal(403, 'origem não permitida');
    return;
  }
  const sameSite = req.headers['sec-fetch-site'] === 'same-origin';
  const sameOrigin = origin !== undefined && allowedOrigins(port).has(origin);
  if (!sameSite && !sameOrigin) throw new Refusal(403, 'origem não permitida');
}

export function checkMethod(req: IncomingMessage, allowed: 'GET' | 'POST'): void {
  if (req.method !== allowed) throw new Refusal(405, `método ${clean(req.method)} não permitido`);
}

/** Reads a JSON body, refusing other content types and anything past 5 MB (A02, A06). */
export async function readJsonBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
  const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') throw new Refusal(415, 'content-type deve ser application/json');
  const declared = Number(req.headers['content-length'] ?? '0');
  if (declared > limit) throw new Refusal(413, 'corpo passa de 5 MB');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new Refusal(413, 'corpo passa de 5 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}
