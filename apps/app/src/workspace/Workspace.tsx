import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Canvas, type CanvasProps } from '../canvas/Canvas';
import { Palette } from '../canvas/Palette';
import { useSimulation } from '../sim/useSimulation';
import { createAutosave, loadSaved } from '../store/autosave';
import { emptyDiagram } from '../store/defaults';
import { useDiagram, type Mode } from '../store/diagram-store';

const STEP_X = 170;
const STEP_Y = 30;

/** The first spot near `at` that no node already occupies, stepping right (and a little down). */
export function freeSpot(
  at: { x: number; y: number },
  taken: { x: number; y: number }[],
): { x: number; y: number } {
  for (let k = 0; k < 50; k += 1) {
    const p = { x: at.x + k * STEP_X, y: at.y + k * STEP_Y };
    const near = (t: { x: number; y: number }) =>
      Math.abs(t.x - p.x) < STEP_X / 2 && Math.abs(t.y - p.y) < STEP_X / 2;
    if (!taken.some(near)) return p;
  }
  return at;
}

export interface WorkspaceProps {
  mode: Mode;
  /** The diagram to start from when nothing is saved for this mode. */
  initial?: () => ReturnType<typeof emptyDiagram>;
  side?: ReactNode;
  top?: ReactNode;
  canvas?: Pick<CanvasProps, 'decorate' | 'overlay'>;
}

/** Palette, canvas and side panel around the diagram store, with autosave per mode. */
export function Workspace({ mode, initial, side, top, canvas }: WorkspaceProps) {
  const centre = useRef<() => { x: number; y: number }>(() => ({ x: 0, y: 0 }));
  const modeKey = mode.kind === 'free' ? 'free' : mode.problemId;

  useEffect(() => {
    useDiagram.getState().start(mode, loadSaved(mode) ?? (initial ? initial() : emptyDiagram()));
    const autosave = createAutosave();
    const unsubscribe = useDiagram.subscribe((s, prev) => {
      if (s.diagram !== prev.diagram) autosave.schedule(s.mode, s.diagram);
    });
    return () => {
      unsubscribe();
      autosave.cancel();
    };
    // The mode's identity is its key; `initial` only matters on the first start.
  }, [modeKey]);

  useSimulation();

  const onReady = useCallback((api: { centre: () => { x: number; y: number } }) => {
    centre.current = api.centre;
  }, []);

  const notice = useDiagram((s) => s.notice);

  return (
    <div className="workspace">
      {top}
      <div className="workspace-body">
        <Palette
          onAdd={(serviceId) => {
            const s = useDiagram.getState();
            s.addNode(
              serviceId,
              freeSpot(
                centre.current(),
                s.diagram.nodes.map((n) => n.position),
              ),
            );
          }}
        />
        <Canvas {...canvas} onReady={onReady} />
        <div className="side-panel">{side}</div>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            type="button"
            className="button"
            onClick={() => {
              useDiagram.getState().dismissNotice();
            }}
          >
            Ok
          </button>
        </div>
      )}
    </div>
  );
}
