import type { Kind } from '@archsim/catalog';
import { cache } from './cache';
import { cdn } from './cdn';
import { compute } from './compute';
import { dns } from './dns';
import { entry } from './entry';
import { fn } from './function';
import { loadBalancer } from './load-balancer';
import { pubsub } from './pubsub';
import { queue } from './queue';
import { sqlDatabase } from './sql-database';
import { stream } from './stream';
import type { KindHandler } from './types';

export type { KindHandler, NodeContext, NodeOutput, NodeState } from './types';
export { makeContext } from './context';

/** Behaviour by kind, never by service id (NFR-11). */
export const handlers: Partial<Record<Kind, KindHandler>> = {
  entry,
  dns,
  cdn,
  'load-balancer': loadBalancer,
  compute,
  function: fn,
  'sql-database': sqlDatabase,
  cache,
  queue,
  pubsub,
  stream,
};
