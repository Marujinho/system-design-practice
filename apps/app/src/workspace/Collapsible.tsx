import type { ReactNode } from 'react';
import { useLayout, type PanelId } from './layout-store';

type Edge = 'left' | 'right' | 'top';

const CHEVRON: Record<Edge, { open: string; closed: string }> = {
  left: { open: '‹', closed: '›' },
  right: { open: '›', closed: '‹' },
  top: { open: '˄', closed: '˅' },
};

export interface CollapsibleProps {
  id: PanelId;
  /** What the button names, lower case: "paleta" → "Recolher paleta". */
  label: string;
  edge: Edge;
  /** Shown on the collapsed strip, next to the button. */
  summary?: ReactNode;
  children: ReactNode;
}

/**
 * A panel around the canvas that folds into a thin strip (edge-hover FR-8–FR-10).
 * The content stays mounted while collapsed, so tabs and fields keep their state (FR-14).
 */
export function Collapsible({ id, label, edge, summary, children }: CollapsibleProps) {
  const collapsed = useLayout((s) => s.collapsed[id]);
  return (
    <div className={`collapsible collapsible-${edge}${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="collapse-toggle"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expandir' : 'Recolher'} ${label}`}
        title={`${collapsed ? 'Expandir' : 'Recolher'} ${label}`}
        onClick={() => {
          useLayout.getState().toggle(id);
        }}
      >
        <span aria-hidden="true">{collapsed ? CHEVRON[edge].closed : CHEVRON[edge].open}</span>
      </button>
      {collapsed && summary}
      <div className="collapsible-body" hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}
