import { add, HOURS_PER_MONTH, latency, monthlyCost, saturate, sum } from '../queueing';
import { reads, writes } from './shared';
import type { KindHandler } from './types';

/**
 * Relational database: writes go to the writer; reads are split evenly across
 * read replicas when there are any, else they also hit the writer (FR-23).
 */
export const sqlDatabase: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit') * (1 + ctx.param('readReplicas')),
  process: (input, ctx) => {
    const cap = ctx.value('capPerUnit');
    const replicas = ctx.param('readReplicas');
    const r = reads(ctx, input);
    const w = writes(ctx, input);

    let processed;
    let errors;
    let rho;
    if (replicas > 0) {
      const writer = saturate(w, cap);
      const readers = saturate(r, cap * replicas);
      processed = add(writer.processed, readers.processed);
      errors = add(writer.errors, readers.errors);
      rho = Math.max(writer.rho, readers.rho);
    } else {
      const writer = saturate(input, cap);
      processed = writer.processed;
      errors = writer.errors;
      rho = writer.rho;
    }
    const { p50, p99 } =
      sum(input) > 0 ? latency(ctx.value('baseLatencyMs'), rho) : { p50: 0, p99: 0 };
    return {
      processed,
      errors,
      forward: processed,
      capacity: cap * (1 + replicas),
      utilization: rho,
      p50,
      p99,
      costMonth: monthlyCost(ctx.variant.prices, { 'unit-hour': (1 + replicas) * HOURS_PER_MONTH }),
      nextState: {},
      warnings: [],
    };
  },
};
