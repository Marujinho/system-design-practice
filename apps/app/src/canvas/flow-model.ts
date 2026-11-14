import type { Diagram } from '@archsim/sim-engine';
import type { FlowFlowEdge } from './FlowEdge';
import type { ServiceFlowNode } from './ServiceNode';
import { edgeWarning } from './connection-rules';

export type NodeSizes = ReadonlyMap<string, { width: number; height: number }>;

/**
 * Hand React Flow back the sizes it measured. A node without `measured` is treated as new:
 * React Flow drops its handles and every edge on it unmounts until the node is measured again.
 */
export function withMeasured(nodes: ServiceFlowNode[], sizes: NodeSizes): ServiceFlowNode[] {
  return nodes.map((n) => {
    const m = sizes.get(n.id);
    return m ? { ...n, measured: m } : n;
  });
}

/** The store's diagram as React Flow nodes and edges. */
export function toFlow(
  diagram: Diagram,
  selection: readonly string[],
): { nodes: ServiceFlowNode[]; edges: FlowFlowEdge[] } {
  const selected = new Set(selection);
  return {
    nodes: diagram.nodes.map((n) => ({
      id: n.id,
      type: 'service',
      position: n.position,
      selected: selected.has(n.id),
      data: { serviceId: n.serviceId, variantId: n.variantId, label: n.label },
    })),
    edges: diagram.edges.map((e) => {
      const parts: string[] = [];
      if (e.weight !== undefined) parts.push(`${Math.round(e.weight * 100)}%`);
      if (e.classes) parts.push(e.classes.join(', '));
      return {
        id: e.id,
        type: 'flow',
        source: e.source,
        target: e.target,
        selected: selected.has(e.id),
        data: { warning: edgeWarning(diagram, e), caption: parts.join(' · ') },
      };
    }),
  };
}
