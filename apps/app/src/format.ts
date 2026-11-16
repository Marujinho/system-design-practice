import { localeOf } from './i18n/lang';
import { currentLang } from './i18n/store';

/** The active language's locale, read at call time (FR-10). */
function locale(): string {
  return localeOf(currentLang());
}

function fixed(value: number, digits: number): string {
  return value.toLocaleString(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** US$ 7,59 */
export function formatUsd(value: number): string {
  return `US$ ${fixed(value, 2)}`;
}

/** 16.667 req/s; below 10 keeps one decimal (0,2 req/s). */
export function formatRps(value: number, unit = 'req/s'): string {
  const digits = Math.abs(value) < 10 && value !== Math.round(value) ? 1 : 0;
  return `${fixed(value, digits)} ${unit}`;
}

/** 333 ms; below 10 ms keeps one decimal. */
export function formatMs(value: number): string {
  return `${fixed(value, Math.abs(value) < 10 ? 1 : 0)} ms`;
}

/** 0.976 → 97,6% */
export function formatPct(fraction: number, digits = 1): string {
  return `${fixed(fraction * 100, digits)}%`;
}

export function formatNumber(value: number, digits = 0): string {
  return fixed(value, digits);
}

/** Up to `digits` decimals, none when not needed: 1 · 0,01 · 1.000 */
export function formatCompact(value: number, digits = 2): string {
  return value.toLocaleString(locale(), { maximumFractionDigits: digits });
}

/** 13/11/2026 in Portuguese, 11/13/2026 in English. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return currentLang() === 'en'
    ? `${m ?? ''}/${d ?? ''}/${y ?? ''}`
    : `${d ?? ''}/${m ?? ''}/${y ?? ''}`;
}
