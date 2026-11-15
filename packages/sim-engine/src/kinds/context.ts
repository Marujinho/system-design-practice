import type { Kind, Service, Variant } from '@archsim/catalog';
import type { DiagramNode, RequestClass } from '../diagram';
import type { ClassRates } from '../graph';
import type { NodeContext, NodeState } from './types';

export function readValue(node: DiagramNode, variant: Variant, key: string): number {
  const override = node.overrides[key];
  if (override !== undefined) return override;
  if (key === 'capPerUnit') return variant.capPerUnit;
  if (key === 'baseLatencyMs') return variant.baseLatencyMs;
  return variant.limits.find((l) => l.id === key)?.value ?? 0;
}

export function readParam(node: DiagramNode, service: Service, key: string): number {
  const own = node.props[key];
  if (own !== undefined) return own;
  return service.params.find((p) => p.key === key)?.default ?? 0;
}

export function makeContext(args: {
  node: DiagramNode;
  service: Service;
  variant: Variant;
  classes: ReadonlyMap<string, RequestClass>;
  dtMs: number;
  state: NodeState;
  downstreamCapacity?: number;
  outDegree?: number;
  outKinds?: readonly Kind[];
  fromInternet?: ClassRates;
}): NodeContext {
  const { node, service, variant } = args;
  return {
    node,
    service,
    variant,
    classes: args.classes,
    dtMs: args.dtMs,
    state: args.state,
    downstreamCapacity: args.downstreamCapacity ?? 0,
    outDegree: args.outDegree ?? 0,
    outKinds: args.outKinds ?? [],
    fromInternet: args.fromInternet ?? {},
    param: (key) => readParam(node, service, key),
    value: (key) => readValue(node, variant, key),
  };
}
