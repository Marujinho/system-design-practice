import type { Diagram, RequirementResult, SimResult } from '@archsim/sim-engine';
import type { When } from './schema';

function compare(a: number, op: '<' | '<=' | '>' | '>=', b: number): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
  }
}

/** Value at a METRIC_PATH; `kind:` paths take the max over nodes of that kind. Undefined when absent. */
export function metricAt(path: string, result: SimResult): number | undefined {
  if (path.startsWith('global.')) {
    const [, field, cls] = path.split('.');
    const g = result.global as unknown as Record<string, unknown>;
    const value = field === undefined ? undefined : g[field];
    if (typeof value === 'number') return value;
    if (cls !== undefined && value !== null && typeof value === 'object') {
      const v = (value as Record<string, unknown>)[cls];
      return typeof v === 'number' ? v : undefined;
    }
    return undefined;
  }
  const match = /^kind:([a-z-]+)\.([A-Za-z0-9]+)$/.exec(path);
  if (!match) return undefined;
  const [, kind, field] = match;
  const values = Object.values(result.nodes)
    .filter((n) => n.kind === kind)
    .map((n) => (n as unknown as Record<string, unknown>)[field ?? ''])
    .filter((v): v is number => typeof v === 'number');
  return values.length > 0 ? Math.max(...values) : undefined;
}

/** Whether a follow-up applies to this design and simulation. Every listed condition must hold. */
export function evaluateWhen(
  when: When | undefined,
  diagram: Diagram,
  result: SimResult,
  requirements: readonly RequirementResult[],
): boolean {
  if (!when) return true;
  const present = new Set(diagram.nodes.map((n) => n.serviceId));
  if (when.hasService && !when.hasService.every((s) => present.has(s))) return false;
  if (when.missingService && !when.missingService.every((s) => !present.has(s))) return false;
  if (when.metric) {
    const value = metricAt(when.metric.path, result);
    if (value === undefined || !compare(value, when.metric.op, when.metric.value)) return false;
  }
  if (when.requirementFails !== undefined) {
    const r = requirements.find((x) => x.id === when.requirementFails);
    if (!r || r.pass) return false;
  }
  return true;
}
