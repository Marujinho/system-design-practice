import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

export interface FlowEdgeData extends Record<string, unknown> {
  warning: string | null;
  caption: string;
}

export type FlowFlowEdge = Edge<FlowEdgeData, 'flow'>;

/** A connection; an unusual one carries a warning mark with the reason (FR-6). */
export function FlowEdge(props: EdgeProps<FlowFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath(props);
  const warning = props.data?.warning ?? null;
  const caption = props.data?.caption ?? '';
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        className={props.selected ? 'flow-edge selected' : 'flow-edge'}
      />
      {(warning !== null || caption !== '') && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {caption !== '' && <span>{caption}</span>}
            {warning !== null && (
              <span className="edge-warning" role="img" aria-label={warning} title={warning}>
                !
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
