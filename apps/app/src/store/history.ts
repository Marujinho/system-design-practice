import type { Diagram } from '@archsim/sim-engine';

export const HISTORY_LIMIT = 100;

export interface History {
  past: Diagram[];
  future: Diagram[];
}

export function push(h: History, snapshot: Diagram): History {
  return { past: [...h.past, snapshot].slice(-HISTORY_LIMIT), future: [] };
}

export function undo(h: History, current: Diagram): { history: History; diagram: Diagram } | null {
  const previous = h.past[h.past.length - 1];
  if (!previous) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [current, ...h.future] },
    diagram: previous,
  };
}

export function redo(h: History, current: Diagram): { history: History; diagram: Diagram } | null {
  const next = h.future[0];
  if (!next) return null;
  return {
    history: { past: [...h.past, current].slice(-HISTORY_LIMIT), future: h.future.slice(1) },
    diagram: next,
  };
}
