import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');

export function reference(problemId: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(ROOT, 'problems', problemId, 'reference.archsim.json'), 'utf8'),
  ) as Record<string, unknown>;
}

/** Start the page with a saved diagram, as autosave would have left it. */
export async function seed(page: Page, key: string, diagram: unknown): Promise<void> {
  await page.addInitScript(
    ([k, d]) => {
      localStorage.setItem(k, JSON.stringify(d));
    },
    [key, diagram] as const,
  );
}

/** Collects page errors and CSP violations. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => {
    // Benign: WebKit reports it when React Flow's observers resize in the same frame.
    if (e.message.startsWith('ResizeObserver loop completed')) return;
    problems.push(`pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /Content[- ]Security[- ]Policy/i.test(t))
      problems.push(`${m.type()}: ${t}`);
  });
  return problems;
}

export function withUnits<T extends Record<string, unknown>>(
  d: T,
  nodeId: string,
  units: number,
): T {
  const copy = structuredClone(d) as T & { nodes: { id: string; props: Record<string, number> }[] };
  const n = copy.nodes.find((x) => x.id === nodeId);
  if (n) n.props.units = units;
  return copy;
}
