import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Canvas } from '../canvas/Canvas';
import { Palette } from '../canvas/Palette';
import { useSimulation } from '../sim/useSimulation';
import { createAutosave, loadSaved } from '../store/autosave';
import { useDecorations } from '../viz/decorate';
import { GlobalBar } from '../viz/GlobalBar';
import { ParticleLayer } from '../viz/ParticleLayer';
import { useReducedMotion } from '../viz/useReducedMotion';
import { emptyDiagram } from '../store/defaults';
import { useDiagram, type Mode } from '../store/diagram-store';
import { Collapsible } from './Collapsible';
import { useLayout } from './layout-store';

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
  /** What the collapsed top strip shows: the problem title, or "Carga" on the free canvas. */
  topSummary?: ReactNode;
}

/** Collapse every panel around the canvas, then put them back as they were (edge-hover FR-12). */
function FocusButton() {
  const active = useLayout((s) => s.before !== null);
  return (
    <button
      type="button"
      className="button focus-canvas"
      aria-pressed={active}
      onClick={() => {
        useLayout.getState().focusCanvas();
      }}
    >
      {active ? 'Restaurar painéis' : 'Focar no canvas'}
    </button>
  );
}

/** On the collapsed side strip: something is selected, its properties are one click away (FR-15). */
function SelectionBadge() {
  const n = useDiagram((s) => s.selection.length);
  if (n === 0) return null;
  return (
    <span
      className="selection-badge num"
      role="status"
      aria-label={`Propriedades — ${n} ${n === 1 ? 'item selecionado' : 'itens selecionados'}`}
    >
      {n}
    </span>
  );
}

/** Palette, canvas and side panel around the diagram store, with autosave per mode. */
export function Workspace({ mode, initial, side, top, topSummary }: WorkspaceProps) {
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
  const reduced = useReducedMotion();
  const decorations = useDecorations(reduced);

  const onReady = useCallback((api: { centre: () => { x: number; y: number } }) => {
    centre.current = api.centre;
  }, []);

  const notice = useDiagram((s) => s.notice);
  const paletteCollapsed = useLayout((s) => s.collapsed.palette);
  const sideCollapsed = useLayout((s) => s.collapsed.side);
  const bodyClass = [
    'workspace-body',
    paletteCollapsed && 'palette-collapsed',
    sideCollapsed && 'side-collapsed',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="workspace">
      <Collapsible
        id="top"
        label="barra superior"
        edge="top"
        summary={<span className="collapsible-summary">{topSummary ?? 'Carga'}</span>}
      >
        <div className="workspace-top">{top}</div>
      </Collapsible>
      <div className={bodyClass}>
        <Collapsible id="palette" label="paleta" edge="left">
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
        </Collapsible>
        <Canvas
          decorate={decorations.nodes}
          decorateEdges={decorations.edges}
          onReady={onReady}
          overlay={
            <>
              <ParticleLayer enabled={!reduced} />
              <GlobalBar />
              <FocusButton />
            </>
          }
        />
        <Collapsible id="side" label="painel lateral" edge="right" summary={<SelectionBadge />}>
          <div className="side-panel">{side}</div>
        </Collapsible>
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
