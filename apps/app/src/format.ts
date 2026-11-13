const pt = 'pt-BR';

function fixed(value: number, digits: number): string {
  return value.toLocaleString(pt, { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
