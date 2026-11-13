import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, type DragEvent, type ReactNode } from 'react';
import { useDiagram } from '../store/diagram-store';
import { protocolFor } from './connection-rules';
import { FlowEdge, type FlowFlowEdge } from './FlowEdge';
import { toFlow } from './flow-model';
import { DRAG_TYPE } from './palette-model';
import { ServiceNode, type ServiceFlowNode } from './ServiceNode';

const nodeTypes = { service: ServiceNode };
const edgeTypes = { flow: FlowEdge };

export interface CanvasProps {
  /** Decorates nodes with live status (visualization layer). */
  decorate?: (nodes: ServiceFlowNode[]) => ServiceFlowNode[];
  overlay?: ReactNode;
  onReady?: (api: { centre: () => { x: number; y: number } }) => void;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function CanvasInner({ decorate, overlay, onReady }: CanvasProps) {
  const diagram = useDiagram((s) => s.diagram);
  const selection = useDiagram((s) => s.selection);
  const flow = useReactFlow();
  const { nodes, edges } = useMemo(() => toFlow(diagram, selection), [diagram, selection]);
  const shown = useMemo(() => (decorate ? decorate(nodes) : nodes), [decorate, nodes]);

  useEffect(() => {
    onReady?.({
      centre: () => {
        const el = document.querySelector('.react-flow');
        const r = el?.getBoundingClientRect();
        return r
          ? flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
          : { x: 0, y: 0 };
      },
    });
  }, [flow, onReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      const s = useDiagram.getState();
      if (e.shiftKey) s.redo();
      else s.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<ServiceFlowNode>[]) => {
    const s = useDiagram.getState();
    const positions: Record<string, { x: number; y: number }> = {};
    let dragging = false;
    let moved = false;
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        positions[c.id] = c.position;
        dragging = dragging || c.dragging === true;
        moved = true;
      }
    }
    if (moved) s.moveNodes(positions, !dragging);
    const picks = changes.filter((c) => c.type === 'select');
    if (picks.length > 0) {
      const current = new Set(s.selection);
      for (const c of picks) {
        if (c.selected) current.add(c.id);
        else current.delete(c.id);
      }
      s.select([...current]);
    }
    if (changes.some((c) => c.type === 'remove')) s.removeSelection();
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowFlowEdge>[]) => {
    const s = useDiagram.getState();
    const picks = changes.filter((c) => c.type === 'select');
    if (picks.length > 0) {
      const current = new Set(s.selection);
      for (const c of picks) {
        if (c.selected) current.add(c.id);
        else current.delete(c.id);
      }
      s.select([...current]);
    }
    if (changes.some((c) => c.type === 'remove')) s.removeSelection();
  }, []);

  const onConnect = useCallback((c: Connection) => {
    const s = useDiagram.getState();
    s.connect(c.source, c.target, protocolFor(s.diagram, c.source, c.target));
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const serviceId = e.dataTransfer.getData(DRAG_TYPE);
      if (!serviceId) return;
      e.preventDefault();
      useDiagram
        .getState()
        .addNode(serviceId, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [flow],
  );

  return (
    <div
      className="canvas"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={shown}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        selectionOnDrag
        panOnDrag={[1, 2]}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
      {diagram.nodes.length === 0 && (
        <p className="canvas-empty">Arraste um serviço ou comece por Usuários.</p>
      )}
      {overlay}
    </div>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
