import type { NodeHealth, NodeMetrics } from '@archsim/sim-engine';
import { formatCompact, formatMs, formatPct, formatRps, formatUsd } from '../format';
import type { Lang } from '../i18n/lang';
import { useLang } from '../i18n/store';
import { translate, useT } from '../i18n/t';

export function healthLabel(h: NodeHealth, lang: Lang): string {
  return translate(lang, `health.${h}` as const);
}

/** A node's live numbers; the state always has a word, never just a colour (NFR-6). */
export function NodeStatus({ m }: { m: NodeMetrics }) {
  const t = useT();
  const lang = useLang();
  if (m.kind === 'entry') {
    return <div className="node-status num">{formatRps(m.rpsOut)}</div>;
  }
  return (
    <div className="node-status num">
      <span className={`health-badge ${m.health}`}>{healthLabel(m.health, lang)}</span>
      <span>
        {formatPct(Math.min(m.utilization, 999), 0)} · {formatRps(m.rpsIn)}
      </span>
      <span>
        p50 {formatMs(m.p50)} · p99 {formatMs(m.p99)}
      </span>
      <span>
        {t('status.error', { pct: formatPct(m.errorRate) })} ·{' '}
        {t('unit.perMonth', { amount: formatUsd(m.costMonth) })}
      </span>
      {m.backlog !== undefined && (
        <span>
          {t('status.queue', {
            n: formatCompact(m.backlog, 0),
            age: formatCompact(m.queueAgeS ?? 0, 1),
          })}
        </span>
      )}
    </div>
  );
}
