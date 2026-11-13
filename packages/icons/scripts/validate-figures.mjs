/**
 * Runs the hairline-create validator on every figure. A figure here is an ES
 * module (`import { HL }` … `export default { … }`); the bench wants a classic
 * figure (global HL … `hairline({ … });`), so the two lines are swapped first.
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../vendor/skill/build.mjs';
import { validate } from '../vendor/skill/validate.mjs';

const figures = fileURLToPath(new URL('../figures/', import.meta.url));

export function toBench(source) {
  const body = source
    .replace(/^import \{ HL \} from '[^']+';\n/m, '')
    .replace(/export default \{([\s\S]*)\};\s*$/, 'hairline({$1});\n');
  if (body === source) throw new Error('not in figure-module form');
  return body;
}

const out = mkdtempSync(join(tmpdir(), 'archsim-figures-'));
let failed = 0;
for (const name of readdirSync(figures)
  .filter((f) => f.endsWith('.figure.js'))
  .sort()) {
  const page = assemble(toBench(readFileSync(join(figures, name), 'utf8')));
  writeFileSync(join(out, name.replace(/\.figure\.js$/, '.html')), page);
  const problems = validate(page);
  if (problems.length === 0) console.info(`ok    ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}\n${problems.map((p) => `      ${p}`).join('\n')}`);
  }
}
process.exitCode = failed > 0 ? 1 : 0;
