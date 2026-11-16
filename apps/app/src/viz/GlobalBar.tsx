import type { SimResult } from '@archsim/sim-engine';
import { useReactFlow } from '@xyflow/react';
import { formatMs, formatPct, formatUsd } from '../format';
import { useT } from '../i18n/t';
import { useSim } from '../sim/sim-store';
import { useDiagram } from '../store/diagram-store';
import { useLayout } from '../workspace/layout-store';

function bottleneckName(result: SimResult): { id: string; label: string } | null {
  const id = result.global.bottleneckId;
  if (id === null) return null;
  const node = useDiagram.getState().diagram.nodes.find((n) => n.id === id);
  return { id, label: node?.label ?? id };
}

/**
 * End-to-end latency per class, error rate, monthly cost and the current bottleneck (FR-27).
 * Folds into a small button; the numbers keep updating meanwhile (edge-hover FR-11).
 */
export function GlobalBar() {
  const t = useT();
  const result = useSim((s) => s.result);
  const classes = useDiagram((s) => s.diagram.load.classes);
  const flow = useReactFlow();
  const collapsed = useLayout((s) => s.collapsed.metrics);
  if (!result) return null;
  if (collapsed) {
    return (
      <button
        type="button"
        className="collapse-toggle global-bar-toggle"
        aria-expanded={false}
        aria-label={t('global.expand')}
        title={t('global.expand')}
        onClick={() => {
          useLayout.getState().toggle('metrics');
        }}
      >
        <span aria-hidden="true">≡</span>
      </button>
    );
  }
  const b = bottleneckName(result);
  return (
    <div className="global-bar num" role="status" aria-label={t('global.label')}>
      {classes.map((c) => (
        <span key={c.name}>
          {c.label}: p50 {formatMs(result.global.p50ByClass[c.name] ?? 0)} · p99{' '}
          {formatMs(result.global.p99ByClass[c.name] ?? 0)}
        </span>
      ))}
      <span>{t('status.error', { pct: formatPct(result.global.errorRate) })}</span>
      <span>{t('unit.perMonth', { amount: formatUsd(result.global.costMonth) })}</span>
      {b && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            useDiagram.getState().select([b.id]);
            void flow.fitView({ nodes: [{ id: b.id }], duration: 300, maxZoom: 1.2 });
          }}
        >
          {t(result.nodes[b.id]?.health === 'bottleneck' ? 'global.bottleneck' : 'global.busiest', {
            name: b.label,
          })}
        </button>
      )}
      <button
        type="button"
        className="collapse-toggle"
        aria-expanded={true}
        aria-label={t('global.collapse')}
        title={t('global.collapse')}
        onClick={() => {
          useLayout.getState().toggle('metrics');
        }}
      >
        <span aria-hidden="true">–</span>
      </button>
    </div>
  );
}
