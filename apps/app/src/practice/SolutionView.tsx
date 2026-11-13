import { catalog } from '@archsim/catalog';
import { simulateSteady, type Diagram } from '@archsim/sim-engine';
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import { FlowEdge } from '../canvas/FlowEdge';
import { toFlow } from '../canvas/flow-model';
import { ServiceNode } from '../canvas/ServiceNode';
import { formatUsd } from '../format';
import { NodeStatus } from '../viz/NodeStatus';

const nodeTypes = { service: ServiceNode };
const edgeTypes = { flow: FlowEdge };

/** The reference, read-only and simulated on its own; the user's diagram is not touched (FR-46). */
export function SolutionView({ reference, onClose }: { reference: Diagram; onClose: () => void }) {
  const result = useMemo(() => simulateSteady(reference, catalog, { ticks: 100 }), [reference]);
  const { nodes, edges } = useMemo(() => {
    const flow = toFlow(reference, []);
    return {
      nodes: flow.nodes.map((n) => {
        const m = result.nodes[n.id];
        return m
          ? { ...n, data: { ...n.data, health: m.health, status: <NodeStatus m={m} /> } }
          : n;
      }),
      edges: flow.edges,
    };
  }, [reference, result]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="solution-title">
      <div className="solution">
        <header className="solution-head">
          <h2 id="solution-title">Uma solução: {reference.name ?? 'referência'}</h2>
          <span className="num muted">{formatUsd(result.global.costMonth)}/mês</span>
          <button type="button" className="button" onClick={onClose}>
            Fechar
          </button>
        </header>
        <div className="solution-canvas">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              deleteKeyCode={null}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
