import { catalog } from '@archsim/catalog';
import {
  LIMITS,
  parseDiagram,
  serializeDiagram,
  type Diagram,
  type DiagramResult,
} from '@archsim/sim-engine';

export function fileName(name: string | undefined): string {
  const base = (name ?? 'diagrama')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base === '' ? 'diagrama' : base}.archsim.json`;
}

/** Download the diagram as a .archsim.json file (FR-34). */
export function downloadDiagram(diagram: Diagram, doc: Document = document): void {
  const blob = new Blob([serializeDiagram(diagram)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName(diagram.name);
  a.rel = 'noopener';
  doc.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read and validate a picked file before anything replaces the current diagram (FR-35, A06, A08). */
export async function readDiagramFile(file: Pick<File, 'size' | 'text'>): Promise<DiagramResult> {
  if (file.size > LIMITS.maxBytes) {
    return { ok: false, code: 'TOO_LARGE', message: 'O arquivo passa de 5 MB.' };
  }
  return parseDiagram(await file.text(), catalog);
}
