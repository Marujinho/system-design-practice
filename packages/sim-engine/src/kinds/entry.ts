import type { KindHandler } from './types';

/** The Users node: emits the load, adds no latency or cost. */
export const entry: KindHandler = {
  capacity: () => Number.POSITIVE_INFINITY,
  process: (input) => ({
    processed: { ...input },
    forward: { ...input },
    errors: {},
    capacity: Number.POSITIVE_INFINITY,
    utilization: 0,
    p50: 0,
    p99: 0,
    costMonth: 0,
    nextState: {},
    warnings: [],
  }),
};
