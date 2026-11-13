import { Catalog } from '@archsim/catalog';
import { CliOutput, History, Problem, Session } from '@archsim/problems';
import { Diagram } from '@archsim/sim-engine';
import { z } from 'zod';

/** JSON Schemas for every file an agent reads (NFR-12), generated from the Zod schemas the code uses. */
export function buildSchemas(): Record<string, string> {
  const entries: [string, z.ZodType][] = [
    ['catalog', Catalog],
    ['diagram', Diagram],
    ['problem', Problem],
    ['session', Session],
    ['history', History],
    ['cli-output', CliOutput],
  ];
  const out: Record<string, string> = {};
  for (const [name, schema] of entries) {
    const json = z.toJSONSchema(schema, { io: 'input' });
    out[`${name}.schema.json`] = `${JSON.stringify(json, null, 2)}\n`;
  }
  return out;
}
