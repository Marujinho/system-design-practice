import { useCallback } from 'react';
import { en } from './en';
import type { Lang } from './lang';
import { pt, type Key } from './pt';
import { currentLang, useLang } from './store';

export type Params = Record<string, string | number>;
type Table = Partial<Record<Key, string>>;

const TABLES: Record<Lang, Table> = { pt, en };

/** Replaces `{name}` with the value as plain text; React escapes it when rendered (A05). */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * The text for `key` in `lang`. A missing translation falls back to Portuguese
 * and warns, never the raw key (NFR-3).
 */
export function translate(lang: Lang, key: Key, params?: Params, tables = TABLES): string {
  const found = tables[lang][key];
  // the types make a gap impossible in the repository; a warning if one slips through anyway
  if (found === undefined && lang !== 'pt') {
    console.warn(`[i18n] sem tradução ${lang}: ${key}`);
  }
  return interpolate(found ?? tables.pt[key] ?? pt[key], params);
}

export type T = (key: Key, params?: Params) => string;

/**
 * `t` in the language active right now, for plain functions called while rendering.
 * The calling component must subscribe (`useT` or `useLang`) to re-render on a switch.
 */
export const tr: T = (key, params) => translate(currentLang(), key, params);

/** `t` bound to the active language; components re-render when it changes. */
export function useT(): T {
  const lang = useLang();
  return useCallback((key: Key, params?: Params) => translate(lang, key, params), [lang]);
}
