import type { ClassRates } from '../graph';
import { latency, pick, saturate, sum } from '../queueing';
import type { NodeContext, NodeOutput } from './types';

export function isWrite(ctx: NodeContext, cls: string): boolean {
  return ctx.classes.get(cls)?.op === 'write';
}

export function isCacheable(ctx: NodeContext, cls: string): boolean {
  const c = ctx.classes.get(cls);
  return c !== undefined && c.cacheable && c.op === 'read';
}

export function payloadKB(ctx: NodeContext, cls: string): number {
  return ctx.classes.get(cls)?.payloadKB ?? 0;
}

/** Σ rate × payload in GB per month over every class. */
export function gbMonth(ctx: NodeContext, rates: ClassRates): number {
  let total = 0;
  for (const [cls, rps] of Object.entries(rates))
    total += (rps * payloadKB(ctx, cls) * 2_628_000) / 1e6;
  return total;
}

/** A synchronous server: capacity, saturation, queueing latency. */
export function serve(
  input: ClassRates,
  ctx: NodeContext,
  capacity: number,
): Pick<NodeOutput, 'processed' | 'errors' | 'capacity' | 'utilization' | 'p50' | 'p99'> {
  const { processed, errors, rho } = saturate(input, capacity);
  const { p50, p99 } =
    sum(input) > 0 ? latency(ctx.value('baseLatencyMs'), rho) : { p50: 0, p99: 0 };
  return { processed, errors, capacity, utilization: rho, p50, p99 };
}

/** What a cache sends to its origin: misses of cacheable reads, everything else whole. */
export function misses(ctx: NodeContext, processed: ClassRates, hitRatio: number): ClassRates {
  const out: ClassRates = {};
  for (const [cls, rps] of Object.entries(processed)) {
    out[cls] = isCacheable(ctx, cls) ? rps * (1 - hitRatio) : rps;
  }
  return out;
}

export function reads(ctx: NodeContext, rates: ClassRates): ClassRates {
  return pick(rates, (cls) => !isWrite(ctx, cls));
}

export function writes(ctx: NodeContext, rates: ClassRates): ClassRates {
  return pick(rates, (cls) => isWrite(ctx, cls));
}
