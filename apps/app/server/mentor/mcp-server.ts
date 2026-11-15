import { TOOL_DESCRIPTION, TOOL_NAME, TOOL_REJECTED, TOOL_RESULT } from './proposal-tool';

/**
 * The source of a minimal MCP server (stdio, newline-delimited JSON-RPC 2.0)
 * that `claude -p` starts for one reply. It exposes only `propor_mudancas`,
 * whose call does nothing but answer that the person decides: the server reads
 * the proposal from the stream. Written to the provider's private directory and
 * run with this Node, so no path inside the repository is assumed (mentor-edits T4).
 */
/** Calls of the tool one reply may make; the next ones are refused (feedback NFR-2). */
export const MAX_TOOL_CALLS = 3;

export function mcpServerSource(inputSchema: Record<string, unknown>, socketPath: string): string {
  const tool = { name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema };
  return `import { createInterface } from 'node:readline';
import { connect } from 'node:net';
const TOOL = ${JSON.stringify(tool)};
const RESULT = ${JSON.stringify(TOOL_RESULT)};
const REJECTED = ${JSON.stringify(TOOL_REJECTED)};
const SOCKET = ${JSON.stringify(socketPath)};
const MAX = ${String(MAX_TOOL_CALLS)};
let calls = 0;
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const text = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
// Asks the archsim server, over its private socket, whether the proposal holds up.
function check(input) {
  return new Promise((resolve) => {
    let buf = '';
    let settled = false;
    const s = connect(SOCKET);
    s.setEncoding('utf8');
    const done = (v) => { if (settled) return; settled = true; clearTimeout(timer); s.destroy(); resolve(v); };
    const timer = setTimeout(() => done(null), 5000);
    s.on('error', () => done(null));
    s.on('data', (d) => {
      buf += d;
      if (buf.length > 65536) { done(null); return; }
      const i = buf.indexOf('\\n');
      if (i < 0) return;
      try { done(JSON.parse(buf.slice(0, i))); } catch { done(null); }
    });
    s.write(JSON.stringify({ input }) + '\\n');
  });
}
for await (const line of createInterface({ input: process.stdin })) {
  let m;
  try { m = JSON.parse(line); } catch { continue; }
  if (m.id === undefined || m.id === null) continue;
  if (m.method === 'initialize') {
    send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'archsim', version: '1' } } });
  } else if (m.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: m.id, result: { tools: [TOOL] } });
  } else if (m.method === 'tools/call') {
    if (!m.params || m.params.name !== TOOL.name) {
      send({ jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'unknown tool' } });
      continue;
    }
    calls += 1;
    if (calls > MAX) {
      send({ jsonrpc: '2.0', id: m.id, result: text('Limite de propostas nesta resposta: explique à pessoa o que faltou.', true) });
      continue;
    }
    const verdict = await check(m.params.arguments);
    if (verdict && verdict.ok === true) send({ jsonrpc: '2.0', id: m.id, result: text(RESULT, false) });
    else if (verdict && typeof verdict.reason === 'string') send({ jsonrpc: '2.0', id: m.id, result: text(REJECTED + verdict.reason, true) });
    else send({ jsonrpc: '2.0', id: m.id, result: text('Não consegui validar a proposta; ela não virou card.', true) });
  } else {
    send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } });
  }
}
`;
}
