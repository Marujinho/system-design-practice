/**
 * PRD §12 A06 / FR-44: no reference solution may reach the browser before a
 * finalization. Every label unique to a reference diagram (not a catalog
 * service name) must be absent from the built JavaScript.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogText = readFileSync(join(root, 'packages/catalog/src/catalog.json'), 'utf8');
/** Words the app ships anyway: the catalog's text and the default Users label. */
const shipped = (label) => catalogText.includes(label) || label === 'Usuários';

const markers = new Map();
for (const id of readdirSync(join(root, 'problems')).filter((d) => !d.startsWith('_') && !d.startsWith('.'))) {
  let ref;
  try {
    ref = JSON.parse(readFileSync(join(root, 'problems', id, 'reference.archsim.json'), 'utf8'));
  } catch {
    continue;
  }
  for (const n of ref.nodes) {
    if (n.label.length > 6 && !shipped(n.label)) markers.set(n.label, id);
  }
  if (ref.name) markers.set(ref.name, id);
}

const assets = join(root, 'apps/app/dist/assets');
const files = readdirSync(assets).filter((f) => f.endsWith('.js'));
if (files.length === 0) {
  console.error('apps/app/dist/assets has no JavaScript: run the build first');
  process.exit(2);
}
let leaks = 0;
for (const f of files) {
  const text = readFileSync(join(assets, f), 'utf8');
  for (const [label, id] of markers) {
    if (text.includes(label)) {
      leaks += 1;
      console.error(`LEAK  ${f}: "${label}" (referência de ${id})`);
    }
  }
}
console.info(`${markers.size} marcadores de referência, ${files.length} arquivos JS, ${leaks} vazamentos`);
process.exit(leaks > 0 ? 1 : 0);
