import { monthlyCost, requestsMillionsPerMonth, sum } from '../queueing';
import { gbMonth, misses, reads, serve, writes } from './shared';
import type { KindHandler } from './types';

/** CDN: serves hits at the edge, forwards misses (FR-13). */
export const cdn: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit'),
  process: (input, ctx) => {
    const served = serve(input, ctx, ctx.value('capPerUnit'));
    return {
      ...served,
      forward: misses(ctx, served.processed, ctx.param('hitRatio')),
      // Reads go out to the internet; writes (uploads) go to the origin, a different and
      // cheaper rate (cost-model FR-4).
      costMonth: monthlyCost(
        ctx.variant.prices,
        {
          gb: gbMonth(ctx, reads(ctx, served.processed)),
          'million-requests': requestsMillionsPerMonth(sum(served.processed)),
        },
        { originTransfer: gbMonth(ctx, writes(ctx, served.processed)) },
      ),
      nextState: {},
      warnings: [],
    };
  },
};
