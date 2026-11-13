import { monthlyCost, requestsMillionsPerMonth, sum } from '../queueing';
import { gbMonth, misses, serve } from './shared';
import type { KindHandler } from './types';

/** CDN: serves hits at the edge, forwards misses (FR-13). */
export const cdn: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit'),
  process: (input, ctx) => {
    const served = serve(input, ctx, ctx.value('capPerUnit'));
    return {
      ...served,
      forward: misses(ctx, served.processed, ctx.param('hitRatio')),
      costMonth: monthlyCost(ctx.variant.prices, {
        gb: gbMonth(ctx, served.processed),
        'million-requests': requestsMillionsPerMonth(sum(served.processed)),
      }),
      nextState: {},
      warnings: [],
    };
  },
};
