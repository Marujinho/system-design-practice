export type Theme = 'light' | 'dark';

const KEY = 'archsim:theme';

/** Browser storage can be missing or throw (private mode, blocked site data). */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoredTheme(
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): Theme | null {
  try {
    const v = storage?.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function storeTheme(
  theme: Theme,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  try {
    storage?.setItem(KEY, theme);
  } catch {
    // Not persisted; the choice still applies for this visit.
  }
}

export function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/** The stored choice wins over the system preference (FR-32). */
export function initialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
}
