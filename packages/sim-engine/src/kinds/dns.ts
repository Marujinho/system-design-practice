import { monthlyCost, requestsMillionsPerMonth, sum } from '../queueing';
import { serve } from './shared';
import type { KindHandler } from './types';

/**
 * DNS: traffic passes through; only `queryShare` of requests is a lookup,
 * so cost and latency scale by it.
 */
export const dns: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit'),
  process: (input, ctx) => {
    const share = ctx.value('queryShare');
    const served = serve(input, ctx, ctx.value('capPerUnit'));
    const queries = sum(served.processed) * share;
    return {
      ...served,
      p50: served.p50 * share,
      p99: served.p99 * share,
      forward: served.processed,
      costMonth: monthlyCost(ctx.variant.prices, {
        'unit-month': 1,
        'million-requests': requestsMillionsPerMonth(queries),
      }),
      nextState: {},
      warnings: [],
    };
  },
};
