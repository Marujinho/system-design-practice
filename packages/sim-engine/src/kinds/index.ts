import type { Kind } from '@archsim/catalog';
import { apiGateway } from './api-gateway';
import { cache } from './cache';
import { cdn } from './cdn';
import { compute } from './compute';
import { dns } from './dns';
import { nat, observability, waf } from './edge-services';
import { entry } from './entry';
import { fn } from './function';
import { kvDatabase } from './kv-database';
import { loadBalancer } from './load-balancer';
import { objectStorage } from './object-storage';
import { pubsub } from './pubsub';
import { queue } from './queue';
import { sqlDatabase } from './sql-database';
import { stream } from './stream';
import type { KindHandler } from './types';

export type { KindHandler, NodeContext, NodeOutput, NodeState } from './types';
export { makeContext } from './context';

/** Behaviour by kind, never by service id (NFR-11). Total: a kind without a handler does not compile. */
export const handlers: Record<Kind, KindHandler> = {
  entry,
  dns,
  cdn,
  'api-gateway': apiGateway,
  'load-balancer': loadBalancer,
  nat,
  waf,
  compute,
  function: fn,
  'object-storage': objectStorage,
  'kv-database': kvDatabase,
  'sql-database': sqlDatabase,
  cache,
  queue,
  pubsub,
  stream,
  /** Search nodes behave like a compute pool: nodes × queries/s. */
  search: compute,
  observability,
};
