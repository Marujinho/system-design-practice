import { ProposalInput } from '@archsim/problems';
import { z } from 'zod';

/** The mentor's only tool: describe changes to the diagram. It changes nothing by itself. */
export const TOOL_NAME = 'propor_mudancas';

/** The name `claude` gives an MCP tool: mcp__<server>__<tool>. */
export const MCP_SERVER_NAME = 'archsim';
export const MCP_TOOL_NAME = `mcp__${MCP_SERVER_NAME}__${TOOL_NAME}`;

export const TOOL_DESCRIPTION =
  'Propõe mudanças no desenho da pessoa. Não aplica nada: a proposta aparece num card e a pessoa ' +
  'decide se aplica. Use só quando a pessoa pedir uma mudança.';

/** What the tool answers, in both providers: the person decides. */
export const TOOL_RESULT = 'Proposta registrada. Ela aparece num card e a pessoa decide se aplica.';

/** The tool's input schema, from the same zod contract the server validates against. */
export function toolInputSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ProposalInput) as Record<string, unknown>;
  Reflect.deleteProperty(schema, '$schema');
  return schema;
}
