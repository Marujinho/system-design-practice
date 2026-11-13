import { monthlyCost, requestsMillionsPerMonth, SECONDS_PER_MONTH, sum } from '../queueing';
import { saturate } from '../queueing';
import type { KindHandler, NodeContext } from './types';

function durationS(ctx: NodeContext): number {
  return Math.max(ctx.param('durationMs'), 1) / 1000;
}

/**
 * Serverless function: concurrency = rps × duration; capPerUnit is the
 * concurrency quota, and the excess comes back as 429 (FR-14, FR-15).
 * No queueing: latency is the duration plus invocation overhead.
 */
export const fn: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit') / durationS(ctx),
  process: (input, ctx) => {
    const duration = durationS(ctx);
    const capacity = ctx.value('capPerUnit') / duration;
    const { processed, errors, rho } = saturate(input, capacity);
    const rps = sum(processed);
    const busy = sum(input) > 0;
    const lat = ctx.value('baseLatencyMs') + duration * 1000;
    const memoryGB = ctx.param('memoryMB') / 1024;
    return {
      processed,
      errors,
      forward: processed,
      capacity,
      utilization: rho,
      p50: busy ? lat : 0,
      p99: busy ? lat : 0,
      costMonth: monthlyCost(ctx.variant.prices, {
        'million-requests': requestsMillionsPerMonth(rps),
        'gb-second': rps * duration * memoryGB * SECONDS_PER_MONTH,
      }),
      nextState: {},
      warnings: [],
    };
  },
};
