import type { FinalizeResponse } from '@archsim/problems';
import { useEffect, useState } from 'react';
import { formatCompact, formatUsd } from '../format';
import { useT } from '../i18n/t';
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
  study = false,
}: {
  result: FinalizeResponse;
  onClose: () => void;
  /** Absent in study mode, where the mentor already discusses the reference. */
  onSolution?: () => void;
  /** Study mode: the score is shown but recorded nowhere (study-mode FR-9). */
  study?: boolean;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const shown = useCountUp(result.score.total, reduced);
  const s = result.score;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="result">
        <header className="result-head">
          <h2 id="result-title">{t('result.title')}</h2>
          <p className="score num" aria-label={t('result.scoreOf', { n: s.total })}>
            {shown}
            <span className="muted">/100</span>
          </p>
          <p className="stars" aria-label={t('list.stars', { n: s.stars })}>
            {starsText(s.stars)}
          </p>
          {study && <p className="record study">{t('result.study')}</p>}
          {!study && result.isRecord && <p className="record">{t('result.record')}</p>}
          {s.belowReference && <p className="badge changed">{t('result.below')}</p>}
          {s.solutionSeen && <p className="muted">{t('result.seen')}</p>}
        </header>

        <dl className="figures">
          <div>
            <dt>{t('result.requirements')}</dt>
            <dd className="num">{formatCompact(s.parts.requirements, 1)}</dd>
          </div>
          <div>
            <dt>{t('result.cost')}</dt>
            <dd className="num">{formatCompact(s.parts.cost, 1)}</dd>
          </div>
          <div>
            <dt>{t('result.headroom')}</dt>
            <dd className="num">{formatCompact(s.parts.headroom, 1)}</dd>
          </div>
          <div>
            <dt>{t('result.costVs')}</dt>
            <dd className="num">
              {t('result.costVsValue', {
                yours: formatUsd(s.userCost),
                ref: formatUsd(s.referenceCost),
              })}
            </dd>
          </div>
        </dl>

        <section>
          <h3>{t('result.requirements')}</h3>
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
                    <span className="sr-only">{t(r.pass ? 'eval.pass' : 'eval.fail')}</span>
                  </span>
                  <span className="num req-values">
                    {line.measured}{' '}
                    <span className="muted">({t('eval.target', { target: line.target })})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {result.findings.length > 0 && (
          <section>
            <h3>{t('result.findings')}</h3>
            <ol className="findings">
              {result.findings.map((f, i) => (
                <li key={`${f.type}-${String(i)}`}>{f.message}</li>
              ))}
            </ol>
          </section>
        )}

        {!study && <AgentHint />}

        <footer className="result-actions">
          <button type="button" className="button primary" onClick={onClose}>
            {t('result.keepGoing')}
          </button>
          {!study && onSolution && (
            <button type="button" className="button" onClick={onSolution}>
              {t('problem.seeSolution')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
