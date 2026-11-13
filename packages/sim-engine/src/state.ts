export type NodeHealth = 'healthy' | 'pressured' | 'critical' | 'bottleneck' | 'unsimulated';

export const THRESHOLDS = { pressured: 0.7, critical: 0.9, bottleneck: 1 } as const;

const GROWING_TICKS = 3;

/** True when the backlog grew on each of the last 3 ticks. */
export function backlogGrowing(history: readonly number[]): boolean {
  if (history.length < GROWING_TICKS + 1) return false;
  const recent = history.slice(-(GROWING_TICKS + 1));
  for (let i = 1; i < recent.length; i += 1) {
    const prev = recent[i - 1];
    const cur = recent[i];
    if (prev === undefined || cur === undefined || cur <= prev) return false;
  }
  return true;
}

/**
 * Visual state from utilization (FR-30): < 0.7 healthy, [0.7, 0.9) pressured,
 * [0.9, 1] critical, > 1 bottleneck. A queue whose backlog keeps growing is a
 * bottleneck too.
 */
export function healthOf(utilization: number, backlogHistory: readonly number[] = []): NodeHealth {
  if (utilization > THRESHOLDS.bottleneck || backlogGrowing(backlogHistory)) return 'bottleneck';
  if (utilization >= THRESHOLDS.critical) return 'critical';
  if (utilization >= THRESHOLDS.pressured) return 'pressured';
  return 'healthy';
}
