import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSchemas } from '../scripts/schemas';

const dir = fileURLToPath(new URL('.', import.meta.url));

describe('exported JSON Schemas (NFR-12)', () => {
  it.each(Object.entries(buildSchemas()))(
    '%s matches the Zod schema (run pnpm schemas)',
    (name, text) => {
      expect(readFileSync(join(dir, name), 'utf8')).toBe(text);
    },
  );
});
