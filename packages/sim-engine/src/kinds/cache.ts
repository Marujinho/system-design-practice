import { HOURS_PER_MONTH, monthlyCost } from '../queueing';
import { misses, serve } from './shared';
import type { KindHandler } from './types';

/** In-memory cache: nodes × ops/s; in line, only misses reach the origin (FR-13). */
export const cache: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit') * ctx.param('units'),
  process: (input, ctx) => {
    const units = ctx.param('units');
    const served = serve(input, ctx, ctx.value('capPerUnit') * units);
    return {
      ...served,
      forward: misses(ctx, served.processed, ctx.param('hitRatio')),
      costMonth: monthlyCost(ctx.variant.prices, { 'unit-hour': units * HOURS_PER_MONTH }),
      nextState: {},
      warnings: [],
    };
  },
};
