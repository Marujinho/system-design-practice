import { evaluate, type Requirement } from '@archsim/sim-engine';
import { formatUsd } from '../format';
import { useT } from '../i18n/t';
import { useSim } from '../sim/sim-store';
import { requirementLine } from './format-req';

/** Each requirement, measured live, with ✓/✗ and the current monthly cost (FR-45). No score before finalizing. */
export function EvaluationPanel({
  requirements,
  onFinalize,
  busy,
  error,
}: {
  requirements: Requirement[];
  onFinalize: () => void;
  busy: boolean;
  error: string | null;
}) {
  const t = useT();
  const result = useSim((s) => s.result);
  const rows = result ? evaluate(result, requirements) : [];
  const met = rows.filter((r) => r.pass).length;
  return (
    <section className="panel evaluation" aria-label={t('eval.label')}>
      <header>
        <h2>{t('eval.title')}</h2>
        <p className="muted">
          {result ? t('eval.met', { met, total: rows.length }) : t('eval.simulating')} ·{' '}
          {t('eval.scoreLater')}
        </p>
      </header>
      <ul className="requirements">
        {rows.map((r) => {
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
      {result && (
        <p className="num cost-now">
          {t('eval.costNow', { amount: formatUsd(result.global.costMonth) })}
        </p>
      )}
      <button type="button" className="button primary" disabled={busy} onClick={onFinalize}>
        {t(busy ? 'eval.scoring' : 'eval.finalize')}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {t('eval.saveError', { error })}
        </p>
      )}
    </section>
  );
}
