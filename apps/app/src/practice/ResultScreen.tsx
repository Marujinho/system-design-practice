import type { FinalizeResponse } from '@archsim/problems';
import { useEffect, useState } from 'react';
import { formatCompact, formatUsd } from '../format';
import { useReducedMotion } from '../viz/useReducedMotion';
import { AgentHint } from './AgentHint';
import { requirementLine, starsText } from './format-req';

const COUNT_MS = 900;

/** Counts up to the score with rAF; lands at once under reduced motion (FR-58). */
export function useCountUp(target: number, reduced: boolean): number {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [target, reduced]);
  return value;
}

export function ResultScreen({
  result,
  onClose,
  onSolution,
}: {
  result: FinalizeResponse;
  onClose: () => void;
  onSolution: () => void;
}) {
  const reduced = useReducedMotion();
  const shown = useCountUp(result.score.total, reduced);
  const s = result.score;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="result">
        <header className="result-head">
          <h2 id="result-title">Resultado</h2>
          <p className="score num" aria-label={`Score ${s.total} de 100`}>
            {shown}
            <span className="muted">/100</span>
          </p>
          <p className="stars" aria-label={`${s.stars} de 3 estrelas`}>
            {starsText(s.stars)}
          </p>
          {result.isRecord && <p className="record">novo recorde</p>}
          {s.belowReference && <p className="badge changed">abaixo da referência</p>}
          {s.solutionSeen && (
            <p className="muted">Solução já vista: esta tentativa não conta para o recorde.</p>
          )}
        </header>

        <dl className="figures">
          <div>
            <dt>Requisitos</dt>
            <dd className="num">{formatCompact(s.parts.requirements, 1)}</dd>
          </div>
          <div>
            <dt>Custo</dt>
            <dd className="num">{formatCompact(s.parts.cost, 1)}</dd>
          </div>
          <div>
            <dt>Folga (1,5× e 2×)</dt>
            <dd className="num">{formatCompact(s.parts.headroom, 1)}</dd>
          </div>
          <div>
            <dt>Seu custo × referência</dt>
            <dd className="num">
              {formatUsd(s.userCost)} × {formatUsd(s.referenceCost)}
            </dd>
          </div>
        </dl>

        <section>
          <h3>Requisitos</h3>
          <ul className="requirements">
            {result.requirements.map((r) => {
              const line = requirementLine(r);
              return (
                <li key={r.id} className={r.pass ? 'pass' : 'fail'}>
                  <span className="req-mark" aria-hidden="true">
                    {r.pass ? '✓' : '✗'}
                  </span>
                  <span className="req-label">
                    {r.label}
                    <span className="sr-only">{r.pass ? ' — atendido' : ' — não atendido'}</span>
                  </span>
                  <span className="num req-values">
                    {line.measured} <span className="muted">(alvo {line.target})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {result.findings.length > 0 && (
          <section>
            <h3>Achados</h3>
            <ol className="findings">
              {result.findings.map((f, i) => (
                <li key={`${f.type}-${String(i)}`}>{f.message}</li>
              ))}
            </ol>
          </section>
        )}

        <AgentHint />

        <footer className="result-actions">
          <button type="button" className="button primary" onClick={onClose}>
            Continuar ajustando
          </button>
          <button type="button" className="button" onClick={onSolution}>
            Ver uma solução
          </button>
        </footer>
      </div>
    </div>
  );
}
