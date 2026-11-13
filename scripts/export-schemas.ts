import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchemas } from './schemas';

const dir = fileURLToPath(new URL('../schemas/', import.meta.url));
for (const [name, text] of Object.entries(buildSchemas())) {
  writeFileSync(join(dir, name), text);
  console.info(`schemas/${name}`);
}
