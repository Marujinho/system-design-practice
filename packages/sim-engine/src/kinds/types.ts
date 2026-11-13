import type { Service, Variant } from '@archsim/catalog';
import type { DiagramNode, RequestClass } from '../diagram';
import type { ClassRates } from '../graph';
import type { SimWarning } from '../warnings';

/** Per-node state carried between ticks (queue backlogs and the like). */
export interface NodeState {
  backlog?: ClassRates;
  backlogHistory?: number[];
  starvedMs?: number;
}

export interface NodeContext {
  node: DiagramNode;
  service: Service;
  variant: Variant;
  /** A param's value: the node's prop, else the catalog default. */
  param(key: string): number;
  /** capPerUnit, baseLatencyMs or a limit id: the node's override, else the catalog. */
  value(key: string): number;
  classes: ReadonlyMap<string, RequestClass>;
  dtMs: number;
  state: NodeState;
  /** Sum of the capacity of the nodes this one feeds (queue consumers). */
  downstreamCapacity: number;
  outDegree: number;
}

export interface NodeOutput {
  /** Handled successfully. */
  processed: ClassRates;
  /** Sent on to outgoing edges, before distribution. */
  forward: ClassRates;
  errors: ClassRates;
  /** Requests per second the node can take. */
  capacity: number;
  utilization: number;
  p50: number;
  p99: number;
  costMonth: number;
  backlog?: number;
  queueAgeS?: number;
  /** Every outgoing edge receives the full forward rate (pub/sub). */
  fanout?: boolean;
  /** Stays off the latency path (async boundary). */
  asyncBoundary?: boolean;
  nextState: NodeState;
  warnings: SimWarning[];
}

export interface KindHandler {
  capacity(ctx: NodeContext): number;
  process(input: ClassRates, ctx: NodeContext): NodeOutput;
}
