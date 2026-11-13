import { useCallback } from 'react';
import type { FlowFlowEdge } from '../canvas/FlowEdge';
import type { ServiceFlowNode } from '../canvas/ServiceNode';
import { useSim } from '../sim/sim-store';
import { NodeStatus } from './NodeStatus';
import { staticStroke } from './particles';

/** Live status on every node, refreshed with each simulation result. */
export function useDecorations(reduced: boolean) {
  const result = useSim((s) => s.result);
  const nodes = useCallback(
    (list: ServiceFlowNode[]): ServiceFlowNode[] =>
      list.map((n) => {
        const m = result?.nodes[n.id];
        return m
          ? { ...n, data: { ...n.data, health: m.health, status: <NodeStatus m={m} /> } }
          : n;
      }),
    [result],
  );
  const edges = useCallback(
    (list: FlowFlowEdge[]): FlowFlowEdge[] =>
      list.map((e) => {
        const r = result?.edges[e.id];
        if (!r || !e.data) return e;
        return {
          ...e,
          data: { ...e.data, stroke: reduced ? staticStroke(r.rps) : 1, errors: r.errorRps > 0 },
        };
      }),
    [result, reduced],
  );
  return { nodes, edges };
}
