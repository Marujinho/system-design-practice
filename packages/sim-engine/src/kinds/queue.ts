import { add, monthlyCost, requestsMillionsPerMonth, saturate, scale, sum } from '../queueing';
import type { ClassRates } from '../graph';
import type { KindHandler, NodeContext } from './types';

/** Messages per second the queue accepts from producers (FIFO quota; Standard is unlimited). */
function acceptRate(ctx: NodeContext): number {
  const calls = ctx.value('callsPerSecond');
  if (calls > 0) return calls * Math.max(1, ctx.param('batchSize'));
  return ctx.value('capPerUnit');
}

/**
 * Queue (FR-18): producers are never blocked; backlog += (in − drained) × dt.
 * Consumers are the nodes on the outgoing edges and drain up to their capacity.
 */
export const queue: KindHandler = {
  capacity: (ctx) => acceptRate(ctx),
  process: (input, ctx) => {
    const dt = ctx.dtMs / 1000;
    const accepted = saturate(input, acceptRate(ctx));
    const previous: ClassRates = ctx.state.backlog ?? {};
    const available = add(previous, scale(accepted.processed, dt));
    const availableTotal = sum(available);

    const drainRate = ctx.outDegree > 0 ? ctx.downstreamCapacity : 0;
    const drainedTotal = Math.min(availableTotal, drainRate * dt);
    const fraction = availableTotal > 0 ? drainedTotal / availableTotal : 0;
    const drained = scale(available, fraction);
    const backlog = scale(available, 1 - fraction);
    const backlogTotal = sum(backlog);
    const forward = scale(drained, dt > 0 ? 1 / dt : 0);
    const drainedRps = sum(forward);

    let starvedMs = ctx.state.starvedMs ?? 0;
    const warnings = [];
    let queueAgeS: number;
    if (backlogTotal > 0 && drainedRps === 0) {
      starvedMs += ctx.dtMs;
      queueAgeS = starvedMs / 1000;
      warnings.push({
        code: 'QUEUE_NO_CONSUMER' as const,
        nodeId: ctx.node.id,
        message: 'A fila acumula mensagens e não tem consumidor.',
      });
    } else {
      starvedMs = 0;
      queueAgeS = drainedRps > 0 ? backlogTotal / drainedRps : 0;
    }

    const inRate = sum(input);
    const requests = sum(accepted.processed) * ctx.value('requestsPerMessage');
    return {
      processed: accepted.processed,
      errors: accepted.errors,
      forward,
      capacity: acceptRate(ctx),
      utilization: drainRate > 0 ? inRate / drainRate : inRate > 0 ? accepted.rho : 0,
      p50: inRate > 0 ? ctx.value('baseLatencyMs') : 0,
      p99: inRate > 0 ? ctx.value('baseLatencyMs') * 2 : 0,
      costMonth: monthlyCost(ctx.variant.prices, {
        'million-requests': requestsMillionsPerMonth(requests),
      }),
      backlog: backlogTotal,
      queueAgeS,
      asyncBoundary: true,
      nextState: { backlog, starvedMs },
      warnings,
    };
  },
};
