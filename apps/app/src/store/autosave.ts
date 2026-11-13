import { catalog } from '@archsim/catalog';
import { parseDiagram, serializeDiagram, type Diagram } from '@archsim/sim-engine';
import { browserStorage } from '../theme/theme';
import type { Mode } from './diagram-store';

export const AUTOSAVE_DELAY_MS = 500;

export function keyOf(mode: Mode): string {
  return mode.kind === 'free' ? 'archsim:free' : `archsim:problem:${mode.problemId}`;
}

/** The last saved diagram for this mode, or null when none, invalid or storage is unavailable (FR-36, A08). */
export function loadSaved(
  mode: Mode,
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): Diagram | null {
  try {
    const text = storage?.getItem(keyOf(mode));
    if (!text) return null;
    const r = parseDiagram(text, catalog);
    return r.ok ? r.diagram : null;
  } catch {
    return null;
  }
}

export function save(
  mode: Mode,
  diagram: Diagram,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  try {
    storage?.setItem(keyOf(mode), serializeDiagram(diagram));
  } catch {
    // Not saved: quota or blocked storage. The diagram stays in memory.
  }
}

/** Debounced saver: call with every change; writes once the user pauses. */
export function createAutosave(
  write: (mode: Mode, d: Diagram) => void = save,
  delay = AUTOSAVE_DELAY_MS,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(mode: Mode, diagram: Diagram) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        write(mode, diagram);
      }, delay);
    },
    cancel() {
      clearTimeout(timer);
    },
  };
}
