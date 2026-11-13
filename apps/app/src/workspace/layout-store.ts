import { create } from 'zustand';
import { browserStorage } from '../theme/theme';

export type PanelId = 'palette' | 'side' | 'top' | 'metrics';
export const PANELS: readonly PanelId[] = ['palette', 'side', 'top', 'metrics'];
export type Collapsed = Record<PanelId, boolean>;

const KEY = 'archsim:layout';

export const EXPANDED: Collapsed = { palette: false, side: false, top: false, metrics: false };
const ALL_COLLAPSED: Collapsed = { palette: true, side: true, top: true, metrics: true };

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
}

/** Which panels around the canvas are collapsed: UI state, never part of the diagram. */
export const useLayout = create<LayoutState>()((set, get) => ({
  collapsed: readLayout(),
  before: null,

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
