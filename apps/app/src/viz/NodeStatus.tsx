import type { NodeHealth, NodeMetrics } from '@archsim/sim-engine';
import { formatCompact, formatMs, formatPct, formatRps, formatUsd } from '../format';

export const HEALTH_LABEL: Record<NodeHealth, string> = {
  healthy: 'saudável',
  pressured: 'pressionado',
  critical: 'crítico',
  bottleneck: 'gargalo',
  unsimulated: 'ciclo não suportado',
};

/** A node's live numbers; the state always has a word, never just a colour (NFR-6). */
export function NodeStatus({ m }: { m: NodeMetrics }) {
  if (m.kind === 'entry') {
    return <div className="node-status num">{formatRps(m.rpsOut)}</div>;
  }
  return (
    <div className="node-status num">
      <span className={`health-badge ${m.health}`}>{HEALTH_LABEL[m.health]}</span>
      <span>
        {formatPct(Math.min(m.utilization, 999), 0)} · {formatRps(m.rpsIn)}
      </span>
      <span>
        p50 {formatMs(m.p50)} · p99 {formatMs(m.p99)}
      </span>
      <span>
        erro {formatPct(m.errorRate)} · {formatUsd(m.costMonth)}/mês
      </span>
      {m.backlog !== undefined && (
        <span>
          fila {formatCompact(m.backlog, 0)} · idade {formatCompact(m.queueAgeS ?? 0, 1)} s
        </span>
      )}
    </div>
  );
}
