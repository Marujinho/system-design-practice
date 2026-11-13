import { monthlyCost, requestsMillionsPerMonth, saturate, sum } from '../queueing';
import type { KindHandler } from './types';

/** Subscribers that pay per delivery (HTTP/S endpoints); queues and functions receive for free. */
const PAID_DELIVERY = new Set(['compute']);

/** Pub/sub (FR-19): every subscriber receives the full publish rate. */
export const pubsub: KindHandler = {
  capacity: (ctx) => ctx.value('capPerUnit'),
  process: (input, ctx) => {
    const { processed, errors, rho } = saturate(input, ctx.value('capPerUnit'));
    const published = sum(processed);
    const busy = sum(input) > 0;
    return {
      processed,
      errors,
      forward: processed,
      fanout: true,
      asyncBoundary: true,
      capacity: ctx.value('capPerUnit'),
      utilization: rho,
      p50: busy ? ctx.value('baseLatencyMs') : 0,
      p99: busy ? ctx.value('baseLatencyMs') * 2 : 0,
      costMonth: monthlyCost(
        ctx.variant.prices,
        {},
        {
          publishes: requestsMillionsPerMonth(published),
          deliveries: requestsMillionsPerMonth(
            published * ctx.outKinds.filter((k) => PAID_DELIVERY.has(k)).length,
          ),
        },
      ),
      nextState: {},
      warnings: [],
    };
  },
};
