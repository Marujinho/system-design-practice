import { HOURS_PER_MONTH, monthlyCost, saturate, sum } from '../queueing';
import type { ClassRates } from '../graph';
import { payloadKB } from './shared';
import type { KindHandler, NodeContext } from './types';

/** Average KB per record across the input classes. */
function averageKB(ctx: NodeContext, input: ClassRates): number {
  const total = sum(input);
  if (total <= 0) return 0;
  let kb = 0;
  for (const [cls, rps] of Object.entries(input)) kb += rps * payloadKB(ctx, cls);
  return kb / total;
}

/** Records/s the stream accepts: per shard, 1,000 records/s or 1 MB/s, whichever binds first. */
function writeCapacity(ctx: NodeContext, kb: number): number {
  const shards = ctx.param('shards');
  const byRecords = ctx.value('writeRecordsPerShard');
  const byBytes = kb > 0 ? (ctx.value('writeMBPerShard') * 1000) / kb : Number.POSITIVE_INFINITY;
  return shards * Math.min(byRecords, byBytes);
}

/** Stream (FR-20): the excess over shard capacity is throttled. */
export const stream: KindHandler = {
  capacity: (ctx) => ctx.param('shards') * ctx.value('writeRecordsPerShard'),
  process: (input, ctx) => {
    const capacity = writeCapacity(ctx, averageKB(ctx, input));
    const { processed, errors, rho } = saturate(input, capacity);
    const busy = sum(input) > 0;
    return {
      processed,
      errors,
      forward: processed,
      asyncBoundary: true,
      capacity,
      utilization: rho,
      p50: busy ? ctx.value('baseLatencyMs') : 0,
      p99: busy ? ctx.value('baseLatencyMs') * 2 : 0,
      costMonth: monthlyCost(ctx.variant.prices, {
        'unit-hour': ctx.param('shards') * HOURS_PER_MONTH,
      }),
      nextState: {},
      warnings: [],
    };
  },
};
