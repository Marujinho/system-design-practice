import type { FigureDef } from './types';

/** figures/<serviceId>.figure.js, bundled eagerly: every node needs its figure at once. */
const modules = import.meta.glob<{ default: FigureDef }>('../figures/*.figure.js', { eager: true });

const FIGURES: Record<string, FigureDef> = {};
for (const [path, mod] of Object.entries(modules)) {
  const id = /\/([a-z]+\.[a-z0-9-]+)\.figure\.js$/.exec(path)?.[1];
  if (id) FIGURES[id] = mod.default;
}

export function figureFor(serviceId: string): FigureDef | undefined {
  return FIGURES[serviceId];
}

export function figureIds(): string[] {
  return Object.keys(FIGURES).sort();
}
