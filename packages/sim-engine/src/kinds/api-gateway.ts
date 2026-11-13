import { monthlyCost, requestsMillionsPerMonth, sum } from '../queueing';
import { serve } from './shared';
import type { KindHandler, NodeContext } from './types';

const MINUTES_PER_MONTH = 730 * 60;

function steadyCapacity(ctx: NodeContext): number {
  return Math.min(ctx.value('capPerUnit'), ctx.value('accountRps'));
}

/**
 * API gateway (FR-24): in steady state the account throttle caps requests
 * (the burst bucket only absorbs spikes). WebSocket variants also pay per
 * connection minute.
 */
export const apiGateway: KindHandler = {
  capacity: steadyCapacity,
  process: (input, ctx) => {
    const served = serve(input, ctx, steadyCapacity(ctx));
    const connections = ctx.param('connections');
    return {
      ...served,
      forward: served.processed,
      costMonth: monthlyCost(
        ctx.variant.prices,
        { 'million-requests': requestsMillionsPerMonth(sum(served.processed)) },
        { connectionMinutes: (connections * MINUTES_PER_MONTH) / 1e6 },
      ),
      nextState: {},
      warnings: [],
    };
  },
};
