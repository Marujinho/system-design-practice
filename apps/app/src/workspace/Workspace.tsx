import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Canvas } from '../canvas/Canvas';
import { freeSpot } from '../canvas/place';
import { Palette } from '../canvas/Palette';
import { useSimulation } from '../sim/useSimulation';
import { createAutosave, loadSaved } from '../store/autosave';
import { useDecorations } from '../viz/decorate';
import { GlobalBar } from '../viz/GlobalBar';
import { ParticleLayer } from '../viz/ParticleLayer';
import { useReducedMotion } from '../viz/useReducedMotion';
import { useT } from '../i18n/t';
import { emptyDiagram } from '../store/defaults';
import { useDiagram, type Mode } from '../store/diagram-store';
import { Collapsible } from './Collapsible';
import { useLayout } from './layout-store';

export interface WorkspaceProps {
  mode: Mode;
  /** The diagram to start from when nothing is saved for this mode. */
  initial?: () => ReturnType<typeof emptyDiagram>;
  side?: ReactNode;
  top?: ReactNode;
  /** What the collapsed top strip shows: the problem title, or "Carga" on the free canvas. */
  topSummary?: ReactNode;
  /**
   * The study-mode mentor: a column right of the side panel when open, nothing
   * but the launcher on the canvas when closed (study-mode FR-3).
   */
  chat?: { panel: ReactNode; launcher: ReactNode };
}

/** Collapse every panel around the canvas, then put them back as they were (edge-hover FR-12). */
function FocusButton() {
  const active = useLayout((s) => s.before !== null);
  const t = useT();
  return (
    <button
      type="button"
      className="button focus-canvas"
      aria-pressed={active}
      onClick={() => {
        useLayout.getState().focusCanvas();
      }}
    >
      {t(active ? 'ws.restore' : 'ws.focus')}
    </button>
  );
}

/** On the collapsed side strip: something is selected, its properties are one click away (FR-15). */
function SelectionBadge() {
  const n = useDiagram((s) => s.selection.length);
  const t = useT();
  if (n === 0) return null;
  return (
    <span
      className="selection-badge num"
      role="status"
      aria-label={t(n === 1 ? 'ws.selectionOne' : 'ws.selectionOther', { n })}
    >
      {n}
    </span>
  );
}

/** Palette, canvas and side panel around the diagram store, with autosave per mode. */
export function Workspace({ mode, initial, side, top, topSummary, chat }: WorkspaceProps) {
  const t = useT();
  const centre = useRef<() => { x: number; y: number }>(() => ({ x: 0, y: 0 }));
  const modeKey = mode.kind === 'free' ? 'free' : `${mode.kind}:${mode.problemId}`;

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
  const chatCollapsed = useLayout((s) => s.collapsed.chat);
  const bodyClass = [
    'workspace-body',
    paletteCollapsed && 'palette-collapsed',
    sideCollapsed && 'side-collapsed',
    chat && !chatCollapsed && 'chat-open',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="workspace">
      <Collapsible
        id="top"
        label={t('ws.top')}
        edge="top"
        summary={<span className="collapsible-summary">{topSummary ?? t('load.label')}</span>}
      >
        <div className="workspace-top">{top}</div>
      </Collapsible>
      <div className={bodyClass}>
        <Collapsible id="palette" label={t('ws.palette')} edge="left">
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
              {chat?.launcher}
            </>
          }
        />
        <Collapsible id="side" label={t('ws.side')} edge="right" summary={<SelectionBadge />}>
          <div className="side-panel">{side}</div>
        </Collapsible>
        {chat && (
          // Stays mounted while closed, so a reply keeps streaming and the draft survives.
          <aside id="mentor-chat" className="chat-column" hidden={chatCollapsed}>
            {chat.panel}
          </aside>
        )}
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
