import { HOURS_PER_MONTH, monthlyCost } from '../queueing';
import { serve } from './shared';
import type { KindHandler } from './types';

/** Instances, tasks or nodes: capPerUnit × units. A cluster fee applies when the catalog has one. */
export const compute: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit') * ctx.param('units'),
  process: (input, ctx) => {
    const units = ctx.param('units');
    const served = serve(input, ctx, ctx.value('capPerUnit') * units);
    return {
      ...served,
      forward: served.processed,
      costMonth: monthlyCost(
        ctx.variant.prices,
        { 'unit-hour': units * HOURS_PER_MONTH },
        { clusterFee: HOURS_PER_MONTH },
      ),
      nextState: {},
      warnings: [],
    };
  },
};
