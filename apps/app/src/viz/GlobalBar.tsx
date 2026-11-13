import type { SimResult } from '@archsim/sim-engine';
import { useReactFlow } from '@xyflow/react';
import { formatMs, formatPct, formatUsd } from '../format';
import { useSim } from '../sim/sim-store';
import { useDiagram } from '../store/diagram-store';

function bottleneckName(result: SimResult): { id: string; label: string } | null {
  const id = result.global.bottleneckId;
  if (id === null) return null;
  const node = useDiagram.getState().diagram.nodes.find((n) => n.id === id);
  return { id, label: node?.label ?? id };
}

/** End-to-end latency per class, error rate, monthly cost and the current bottleneck (FR-27). */
export function GlobalBar() {
  const result = useSim((s) => s.result);
  const classes = useDiagram((s) => s.diagram.load.classes);
  const flow = useReactFlow();
  if (!result) return null;
  const b = bottleneckName(result);
  return (
    <div className="global-bar num" role="status" aria-label="Resultado global">
      {classes.map((c) => (
        <span key={c.name}>
          {c.label}: p50 {formatMs(result.global.p50ByClass[c.name] ?? 0)} · p99{' '}
          {formatMs(result.global.p99ByClass[c.name] ?? 0)}
        </span>
      ))}
      <span>erro {formatPct(result.global.errorRate)}</span>
      <span>{formatUsd(result.global.costMonth)}/mês</span>
      {b && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            useDiagram.getState().select([b.id]);
            void flow.fitView({ nodes: [{ id: b.id }], duration: 300, maxZoom: 1.2 });
          }}
        >
          gargalo: {b.label}
        </button>
      )}
    </div>
  );
}
