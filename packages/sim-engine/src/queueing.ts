import type { Price, PriceUnit } from '@archsim/catalog';
import type { ClassRates } from './graph';

export const HOURS_PER_MONTH = 730;
export const SECONDS_PER_MONTH = HOURS_PER_MONTH * 3600; // 2,628,000
const SATURATION = 0.95;
/** ln(100)/ln(2) − 1: p99/p50 of an exponential sojourn time, minus one. */
const P99_SLOPE = 5.64;

export function sum(rates: ClassRates): number {
  let total = 0;
  for (const v of Object.values(rates)) total += v;
  return total;
}

export function scale(rates: ClassRates, factor: number): ClassRates {
  const out: ClassRates = {};
  for (const [k, v] of Object.entries(rates)) out[k] = v * factor;
  return out;
}

export function add(a: ClassRates, b: ClassRates): ClassRates {
  const out: ClassRates = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function subtract(a: ClassRates, b: ClassRates): ClassRates {
  const out: ClassRates = {};
  for (const [k, v] of Object.entries(a)) out[k] = Math.max(0, v - (b[k] ?? 0));
  return out;
}

export function pick(rates: ClassRates, keep: (cls: string) => boolean): ClassRates {
  const out: ClassRates = {};
  for (const [k, v] of Object.entries(rates)) if (keep(k)) out[k] = v;
  return out;
}

/**
 * M/M/1-style latency (FR-16). Below 95% utilization p50 = base / (1 − ρ);
 * from there it is pinned at 20× base (sync services turn the excess into
 * errors instead of queueing). p99 grows from p50 towards ~6.6× p50.
 */
export function latency(baseMs: number, rho: number): { p50: number; p99: number } {
  const r = Math.max(0, rho);
  const p50 = r < SATURATION ? baseMs / (1 - r) : baseMs / (1 - SATURATION);
  const p99 = p50 * (1 + P99_SLOPE * Math.min(r, 1));
  return { p50, p99 };
}

/** Cut the input proportionally across classes when it exceeds capacity. */
export function saturate(
  input: ClassRates,
  capacity: number,
): { processed: ClassRates; errors: ClassRates; rho: number } {
  const total = sum(input);
  const rho = capacity > 0 ? total / capacity : total > 0 ? Number.POSITIVE_INFINITY : 0;
  if (total <= capacity) return { processed: { ...input }, errors: scale(input, 0), rho };
  const factor = capacity > 0 ? capacity / total : 0;
  return { processed: scale(input, factor), errors: scale(input, 1 - factor), rho };
}

/** Monthly quantity in each price dimension. */
export type Usage = Partial<Record<PriceUnit, number>>;

export function requestsMillionsPerMonth(rps: number): number {
  return (rps * SECONDS_PER_MONTH) / 1e6;
}

export function gbPerMonth(rps: number, payloadKB: number): number {
  return (rps * payloadKB * SECONDS_PER_MONTH) / 1e6;
}

/**
 * Σ price × usage. `byId` overrides the dimension for a specific price, for
 * services with two prices in one dimension (reads vs writes).
 */
export function monthlyCost(
  prices: Price[],
  usage: Usage,
  byId: Record<string, number> = {},
): number {
  let total = 0;
  for (const p of prices) {
    const quantity = byId[p.id] ?? usage[p.per] ?? 0;
    total += p.amountUsd * quantity;
  }
  return total;
}
