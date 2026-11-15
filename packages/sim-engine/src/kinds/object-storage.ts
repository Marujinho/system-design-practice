import { add, latency, monthlyCost, requestsMillionsPerMonth, saturate, sum } from '../queueing';
import { gbMonth, reads, toInternet, writes } from './shared';
import type { KindHandler } from './types';

/**
 * Object storage (FR-21): GET and PUT limits per prefix × prefixes; writes
 * are PUTs, everything else GETs; the excess is 503 SlowDown.
 */
export const objectStorage: KindHandler = {
  capacity: (ctx) => ctx.value('getPerPrefix') * ctx.param('prefixes'),
  process: (input, ctx) => {
    const prefixes = ctx.param('prefixes');
    const get = saturate(reads(ctx, input), ctx.value('getPerPrefix') * prefixes);
    const put = saturate(writes(ctx, input), ctx.value('putPerPrefix') * prefixes);
    const processed = add(get.processed, put.processed);
    const rho = Math.max(get.rho, put.rho);
    const { p50, p99 } =
      sum(input) > 0 ? latency(ctx.value('baseLatencyMs'), rho) : { p50: 0, p99: 0 };
    return {
      processed,
      errors: add(get.errors, put.errors),
      forward: processed,
      capacity: ctx.value('getPerPrefix') * prefixes,
      utilization: rho,
      p50,
      p99,
      costMonth: monthlyCost(
        ctx.variant.prices,
        // Reads leave AWS only when the internet asked for them; to CloudFront or to a
        // service in the region, S3 transfer is free (cost-model FR-3).
        {
          gb: gbMonth(ctx, toInternet(ctx, input, get.processed)),
          'gb-month': ctx.param('storageGb'), // cost-model FR-5
        },
        {
          getRequests: requestsMillionsPerMonth(sum(get.processed)),
          putRequests: requestsMillionsPerMonth(sum(put.processed)),
        },
      ),
      nextState: {},
      warnings: [],
    };
  },
};
