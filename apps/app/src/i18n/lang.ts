import { browserStorage } from '../theme/theme';

export type Lang = 'pt' | 'en';

export const LANGS: readonly Lang[] = ['pt', 'en'];

const KEY = 'archsim:lang';

/** `pt` → `pt-BR`, `en` → `en-US`: the locale for numbers and the `<html lang>` (FR-10, FR-12). */
export function localeOf(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'pt-BR';
}

export function isLang(v: unknown): v is Lang {
  return v === 'pt' || v === 'en';
}

/** The stored choice, or null when missing, unreadable or not one of the two (A08). */
export function readStoredLang(
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): Lang | null {
  try {
    const v = storage?.getItem(KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeLang(
  lang: Lang,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  try {
    storage?.setItem(KEY, lang);
  } catch {
    // Not persisted; the choice still applies for this visit (FR-3).
  }
}

/** English for an `en-*` browser, Portuguese for anything else (FR-4). */
export function browserLang(
  language: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language,
): Lang {
  return typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'en' : 'pt';
}

/** The stored choice wins over the browser (FR-4). */
export function initialLang(): Lang {
  return readStoredLang() ?? browserLang();
}

export function applyLang(lang: Lang, root: HTMLElement = document.documentElement): void {
  root.lang = lang === 'en' ? 'en' : 'pt-BR';
}
