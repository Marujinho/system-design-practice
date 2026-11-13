import { z } from 'zod';
import type { SimResult } from './step';

/** Only what the engine measures can be pass/fail (FR-42). */
export const Metric = z.enum([
  'throughput',
  'p99',
  'errorRate',
  'costMonth',
  'queueAge',
  'queueStable',
]);
export type Metric = z.infer<typeof Metric>;

export const Requirement = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().min(1).max(120),
    metric: Metric,
    class: z.string().optional(),
    op: z.enum(['<=', '>=']),
    value: z.number().nonnegative(),
    unit: z.string(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if ((r.metric === 'throughput' || r.metric === 'p99') && r.class === undefined) {
      ctx.addIssue({ code: 'custom', path: ['class'], message: `${r.metric} precisa de class` });
    }
  });
export type Requirement = z.infer<typeof Requirement>;

export interface RequirementResult {
  id: string;
  label: string;
  metric: Metric;
  class?: string;
  op: '<=' | '>=';
  measured: number;
  target: number;
  unit: string;
  pass: boolean;
}

/** Tolerance for float noise when a design sits exactly on a target. */
const EPS = 1e-9;

export function measure(result: SimResult, r: Requirement): number {
  const cls = r.class ?? '';
  switch (r.metric) {
    case 'throughput':
      return result.global.throughputByClass[cls] ?? 0;
    case 'p99':
      return result.global.p99ByClass[cls] ?? 0;
    case 'errorRate':
      return result.global.errorRate;
    case 'costMonth':
      return result.global.costMonth;
    case 'queueAge':
      return Math.max(0, ...Object.values(result.nodes).map((n) => n.queueAgeS ?? 0));
    case 'queueStable':
      return Object.values(result.nodes).filter(
        (n) => n.backlog !== undefined && n.health === 'bottleneck',
      ).length;
  }
}

export function evaluate(
  result: SimResult,
  requirements: readonly Requirement[],
): RequirementResult[] {
  return requirements.map((r) => {
    const measured = measure(result, r);
    const pass =
      r.op === '<=' ? measured <= r.value * (1 + EPS) + EPS : measured >= r.value * (1 - EPS) - EPS;
    const out: RequirementResult = {
      id: r.id,
      label: r.label,
      metric: r.metric,
      op: r.op,
      measured,
      target: r.value,
      unit: r.unit,
      pass,
    };
    if (r.class !== undefined) out.class = r.class;
    return out;
  });
}
