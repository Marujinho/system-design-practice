import type { ClassRates } from '../graph';
import { HOURS_PER_MONTH, latency, monthlyCost, requestsMillionsPerMonth, sum } from '../queueing';
import { isWrite, payloadKB } from './shared';
import type { KindHandler, NodeContext } from './types';

/** Capacity units one request costs: 1 per KB written; 0.5 per 4 KB read (eventually consistent). */
function unitsPerRequest(ctx: NodeContext, cls: string): number {
  const kb = Math.max(payloadKB(ctx, cls), 0.001);
  return isWrite(ctx, cls) ? Math.ceil(kb) : Math.ceil(kb / 4) * 0.5;
}

interface Side {
  units: number;
  accepted: number;
  rho: number;
}

/**
 * Accept units for one side (reads or writes): the hottest key's share is
 * capped by its partition; the table cap applies to the total (FR-22).
 */
function admit(units: number, hotShare: number, partitionLimit: number, tableLimit: number): Side {
  if (units <= 0) return { units: 0, accepted: 0, rho: 0 };
  const hot = units * hotShare;
  const hotAccepted = Math.min(hot, partitionLimit);
  const accepted = Math.min(hotAccepted + (units - hot), tableLimit);
  const rho = Math.max(
    tableLimit > 0 ? units / tableLimit : 0,
    partitionLimit > 0 ? hot / partitionLimit : 0,
  );
  return { units, accepted, rho };
}

/** Key-value database: per-table capacity and per-partition hot-key limits; excess is throttled. */
export const kvDatabase: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit'),
  process: (input, ctx) => {
    const provisioned = ctx.variant.prices.some((p) => p.id === 'wcuHours');
    const share = ctx.param('hotKeyShare');
    let writeUnits = 0;
    let readUnits = 0;
    for (const [cls, rps] of Object.entries(input)) {
      if (isWrite(ctx, cls)) writeUnits += rps * unitsPerRequest(ctx, cls);
      else readUnits += rps * unitsPerRequest(ctx, cls);
    }
    const tableW = provisioned ? ctx.param('wcu') : ctx.value('capPerUnit');
    const tableR = provisioned ? ctx.param('rcu') : ctx.value('capPerUnit');
    const w = admit(writeUnits, share, ctx.value('partitionWcu'), tableW);
    const r = admit(readUnits, share, ctx.value('partitionRcu'), tableR);
    const wFraction = w.units > 0 ? w.accepted / w.units : 1;
    const rFraction = r.units > 0 ? r.accepted / r.units : 1;

    const processed: ClassRates = {};
    const errors: ClassRates = {};
    for (const [cls, rps] of Object.entries(input)) {
      const f = isWrite(ctx, cls) ? wFraction : rFraction;
      processed[cls] = rps * f;
      errors[cls] = rps * (1 - f);
    }
    const rho = Math.max(w.rho, r.rho);
    const { p50, p99 } =
      sum(input) > 0 ? latency(ctx.value('baseLatencyMs'), rho) : { p50: 0, p99: 0 };
    const costMonth = provisioned
      ? monthlyCost(
          ctx.variant.prices,
          {},
          {
            wcuHours: ctx.param('wcu') * HOURS_PER_MONTH,
            rcuHours: ctx.param('rcu') * HOURS_PER_MONTH,
          },
        )
      : monthlyCost(
          ctx.variant.prices,
          {},
          {
            writeRequests: requestsMillionsPerMonth(w.accepted),
            readRequests: requestsMillionsPerMonth(r.accepted),
          },
        );
    return {
      processed,
      errors,
      forward: processed,
      capacity: Math.min(tableW, tableR),
      utilization: rho,
      p50,
      p99,
      costMonth,
      nextState: {},
      warnings: [],
    };
  },
};
