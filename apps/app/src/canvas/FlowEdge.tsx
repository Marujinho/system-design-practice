import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useStore,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { useDiagram } from '../store/diagram-store';

export interface FlowEdgeData extends Record<string, unknown> {
  warning: string | null;
  caption: string;
  /** Stroke width: grows with traffic in the reduced-motion view. */
  stroke?: number;
  /** Errors flow back along this edge. */
  errors?: boolean;
}

export type FlowFlowEdge = Edge<FlowEdgeData, 'flow'>;

/** How long the remove button outlives the pointer, so it can travel from the line to it. */
export const HOVER_GRACE_MS = 120;

/** On-screen size of the remove button, whatever the zoom (NFR-2: at least 16×16 px). */
export const REMOVE_PX = 16;

/**
 * A connection; an unusual one carries a warning mark with the reason (FR-6).
 * Hovered or selected, it offers a button that removes just this edge (edge-hover FR-1, FR-2).
 */
export function FlowEdge(props: EdgeProps<FlowFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath(props);
  const warning = props.data?.warning ?? null;
  const caption = props.data?.caption ?? '';
  const [hovered, setHovered] = useState(false);
  // labels live inside the zoomed viewport: undo the zoom so the button stays clickable
  const zoom = useStore((s) => s.transform[2]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHovered(true);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setHovered(false);
    }, HOVER_GRACE_MS);
  };

  const showRemove = hovered || props.selected === true;
  return (
    <>
      <g onMouseEnter={enter} onMouseLeave={leave}>
        <BaseEdge
          id={props.id}
          path={path}
          interactionWidth={20}
          className={props.selected ? 'flow-edge selected' : 'flow-edge'}
        />
      </g>
      {(warning !== null || caption !== '' || showRemove) && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onMouseEnter={enter}
            onMouseLeave={leave}
          >
            {caption !== '' && <span>{caption}</span>}
            {warning !== null && (
              <span className="edge-warning" role="img" aria-label={warning} title={warning}>
                !
              </span>
            )}
            {showRemove && (
              <button
                type="button"
                className="edge-remove nodrag nopan nokey"
                style={{
                  width: REMOVE_PX / zoom,
                  height: REMOVE_PX / zoom,
                  fontSize: 12 / zoom,
                  borderWidth: 1 / zoom,
                }}
                aria-label="Remover conexão"
                title="Remover conexão"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  useDiagram.getState().removeEdge(props.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
