import { HOURS_PER_MONTH, monthlyCost, sum } from '../queueing';
import { gbMonth, serve } from './shared';
import type { KindHandler } from './types';

/**
 * Load balancer billed per hour plus capacity units: the largest of new
 * connections, rule evaluations and GB processed per hour.
 */
export const loadBalancer: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit'),
  process: (input, ctx) => {
    const served = serve(input, ctx, ctx.value('capPerUnit'));
    const rps = sum(served.processed);
    const perLcu = (key: string) => Math.max(ctx.value(key), Number.MIN_VALUE);
    const gbPerHour = gbMonth(ctx, served.processed) / HOURS_PER_MONTH;
    const lcus = Math.max(
      (rps * ctx.value('newConnectionShare')) / perLcu('newConnectionsPerLcu'),
      rps / perLcu('ruleEvaluationsPerLcu'),
      gbPerHour / perLcu('gbPerHourPerLcu'),
    );
    return {
      ...served,
      forward: served.processed,
      costMonth: monthlyCost(ctx.variant.prices, {
        'unit-hour': HOURS_PER_MONTH,
        'capacity-unit-hour': lcus * HOURS_PER_MONTH,
      }),
      nextState: {},
      warnings: [],
    };
  },
};
