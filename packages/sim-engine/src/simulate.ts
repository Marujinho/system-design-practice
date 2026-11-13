import type { Catalog } from '@archsim/catalog';
import type { Diagram } from './diagram';
import { initialState, step, type SimResult } from './step';

export const TICK_MS = 100;

/** The same diagram with every request class multiplied. */
export function scaleLoad(diagram: Diagram, multiplier: number): Diagram {
  return {
    ...diagram,
    load: {
      classes: diagram.load.classes.map((c) => ({
        ...c,
        ...(c.users === undefined ? {} : { users: c.users * multiplier }),
        ...(c.rps === undefined ? {} : { rps: c.rps * multiplier }),
        ...(c.rpm === undefined ? {} : { rpm: c.rpm * multiplier }),
      })),
    },
  };
}

export interface SteadyOptions {
  ticks?: number;
  loadMultiplier?: number;
  dtMs?: number;
}

/** Run `ticks` ticks headless and return the last result (CLI and score). */
export function simulateSteady(
  diagram: Diagram,
  catalog: Catalog,
  options: SteadyOptions = {},
): SimResult {
  const ticks = Math.max(1, Math.floor(options.ticks ?? 600));
  const dtMs = options.dtMs ?? TICK_MS;
  const scaled = scaleLoad(diagram, options.loadMultiplier ?? 1);
  let state = initialState();
  let last = step(state, scaled, catalog, dtMs);
  for (let i = 1; i < ticks; i += 1) {
    state = last.state;
    last = step(state, scaled, catalog, dtMs);
  }
  return last.result;
}
