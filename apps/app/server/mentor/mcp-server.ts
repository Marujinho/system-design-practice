import { TOOL_DESCRIPTION, TOOL_NAME, TOOL_RESULT } from './proposal-tool';

/**
 * The source of a minimal MCP server (stdio, newline-delimited JSON-RPC 2.0)
 * that `claude -p` starts for one reply. It exposes only `propor_mudancas`,
 * whose call does nothing but answer that the person decides: the server reads
 * the proposal from the stream. Written to the provider's private directory and
 * run with this Node, so no path inside the repository is assumed (mentor-edits T4).
 */
export function mcpServerSource(inputSchema: Record<string, unknown>): string {
  const tool = { name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema };
  return `import { createInterface } from 'node:readline';
const TOOL = ${JSON.stringify(tool)};
const RESULT = ${JSON.stringify(TOOL_RESULT)};
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
for await (const line of createInterface({ input: process.stdin })) {
  let m;
  try { m = JSON.parse(line); } catch { continue; }
  if (m.id === undefined || m.id === null) continue;
  if (m.method === 'initialize') {
    send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'archsim', version: '1' } } });
  } else if (m.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: m.id, result: { tools: [TOOL] } });
  } else if (m.method === 'tools/call') {
    if (m.params && m.params.name === TOOL.name) send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: RESULT }] } });
    else send({ jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'unknown tool' } });
  } else {
    send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } });
  }
}
`;
}
