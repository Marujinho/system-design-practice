import type { Requirement, RequirementResult } from '@archsim/sim-engine';
import { formatCompact, formatMs, formatPct, formatRps, formatUsd } from '../format';

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
      return value === 0 ? 'estável' : `${formatCompact(value, 0)} crescendo`;
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

export const DIFFICULTY: Record<'facil' | 'medio' | 'dificil', string> = {
  facil: 'fácil',
  medio: 'médio',
  dificil: 'difícil',
};
