import { HOURS_PER_MONTH, monthlyCost, requestsMillionsPerMonth, scale, sum } from '../queueing';
import { gbMonth, serve } from './shared';
import type { KindHandler } from './types';

/** Web application firewall: inspects (and bills) every request, passes all but the blocked share. */
export const waf: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit'),
  process: (input, ctx) => {
    const served = serve(input, ctx, ctx.value('capPerUnit'));
    return {
      ...served,
      forward: scale(served.processed, 1 - ctx.param('blockedShare')),
      costMonth: monthlyCost(
        ctx.variant.prices,
        { 'million-requests': requestsMillionsPerMonth(sum(served.processed)) },
        { webAcl: 1, rules: ctx.param('rules') },
      ),
      nextState: {},
      warnings: [],
    };
  },
};

/** NAT gateway: billed per gateway-hour and per GB processed. */
export const nat: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit') * ctx.param('units'),
  process: (input, ctx) => {
    const units = ctx.param('units');
    const served = serve(input, ctx, ctx.value('capPerUnit') * units);
    return {
      ...served,
      forward: served.processed,
      costMonth: monthlyCost(ctx.variant.prices, {
        'unit-hour': units * HOURS_PER_MONTH,
        gb: gbMonth(ctx, served.processed),
      }),
      nextState: {},
      warnings: [],
    };
  },
};

/** Logs and metrics: off the request path, only adds cost. */
export const observability: KindHandler = {
  capacity: () => Number.POSITIVE_INFINITY,
  process: (_input, ctx) => ({
    processed: {},
    forward: {},
    errors: {},
    capacity: Number.POSITIVE_INFINITY,
    utilization: 0,
    p50: 0,
    p99: 0,
    costMonth: monthlyCost(
      ctx.variant.prices,
      { gb: ctx.param('logsGB') },
      { metrics: ctx.param('metrics') },
    ),
    nextState: {},
    warnings: [],
  }),
};
