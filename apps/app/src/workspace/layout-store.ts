import { create } from 'zustand';
import { browserStorage } from '../theme/theme';

export type PanelId = 'palette' | 'side' | 'top' | 'metrics' | 'chat';
export const PANELS: readonly PanelId[] = ['palette', 'side', 'top', 'metrics', 'chat'];
export type Collapsed = Record<PanelId, boolean>;

const KEY = 'archsim:layout';

/**
 * The default layout: every panel open, except the mentor chat, which starts as
 * a floating pill and opens when asked (study-mode FR-3).
 */
export const EXPANDED: Collapsed = {
  palette: false,
  side: false,
  top: false,
  metrics: false,
  chat: true,
};
const ALL_COLLAPSED: Collapsed = {
  palette: true,
  side: true,
  top: true,
  metrics: true,
  chat: true,
};

/** The saved panel layout; anything missing, malformed or unreadable means expanded (NFR-5). */
export function readLayout(storage: Pick<Storage, 'getItem'> | null = browserStorage()): Collapsed {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...EXPANDED };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...EXPANDED };
    }
    const saved = parsed as Record<string, unknown>;
    const out = { ...EXPANDED };
    for (const id of PANELS) {
      const v = saved[id];
      if (typeof v === 'boolean') out[id] = v;
    }
    return out;
  } catch {
    return { ...EXPANDED };
  }
}

export function storeLayout(
  collapsed: Collapsed,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  const only = Object.fromEntries(PANELS.map((id) => [id, collapsed[id]]));
  try {
    storage?.setItem(KEY, JSON.stringify(only));
  } catch {
    // blocked storage: the layout just won't survive a reload
  }
}

export interface LayoutState {
  collapsed: Collapsed;
  /** The layout before "Focar no canvas", to restore it; null when not focused. */
  before: Collapsed | null;
  toggle(id: PanelId): void;
  focusCanvas(): void;
  /** Bumped on every request to show a node's properties; screens with tabs follow it. */
  propertiesRequest: number;
  /** Open the side panel (if folded) and ask for the properties tab (mentor-edits FR-14). */
  showProperties(): void;
}

/** Which panels around the canvas are collapsed: UI state, never part of the diagram. */
export const useLayout = create<LayoutState>()((set, get) => ({
  collapsed: readLayout(),
  before: null,
  propertiesRequest: 0,

  showProperties: () => {
    const { collapsed, propertiesRequest } = get();
    if (collapsed.side) {
      const next = { ...collapsed, side: false };
      set({ collapsed: next, before: null });
      storeLayout(next);
    }
    set({ propertiesRequest: propertiesRequest + 1 });
  },

  toggle: (id) => {
    const { collapsed } = get();
    const next = { ...collapsed, [id]: !collapsed[id] };
    set({ collapsed: next, before: null });
    storeLayout(next);
  },

  focusCanvas: () => {
    const { collapsed, before } = get();
    const next = before ?? { ...ALL_COLLAPSED };
    set({ collapsed: next, before: before ? null : collapsed });
    storeLayout(next);
  },
}));
