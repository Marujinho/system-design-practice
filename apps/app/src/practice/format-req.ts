import type { Requirement, RequirementResult } from '@archsim/sim-engine';
import { formatCompact, formatMs, formatPct, formatRps, formatUsd } from '../format';
import type { Lang } from '../i18n/lang';
import { tr, translate } from '../i18n/t';

export function formatMeasure(metric: Requirement['metric'], value: number, unit: string): string {
  switch (metric) {
    case 'throughput':
      return formatRps(value, unit);
    case 'p99':
      return formatMs(value);
    case 'errorRate':
      return formatPct(value, 2);
    case 'costMonth':
      return formatUsd(value);
    case 'queueAge':
      return `${formatCompact(value, 1)} s`;
    case 'queueStable':
      return value === 0 ? tr('req.stable') : tr('req.growing', { n: formatCompact(value, 0) });
  }
}

export function requirementLine(
  r: Pick<RequirementResult, 'metric' | 'measured' | 'target' | 'unit' | 'op'>,
): { measured: string; target: string } {
  return {
    measured: formatMeasure(r.metric, r.measured, r.unit),
    target: `${r.op === '<=' ? '≤' : '≥'} ${formatMeasure(r.metric, r.target, r.unit)}`,
  };
}

export function starsText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

export function difficultyLabel(d: 'facil' | 'medio' | 'dificil', lang: Lang): string {
  return translate(lang, `difficulty.${d}` as const);
}
