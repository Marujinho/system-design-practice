import { evaluate, type Requirement } from '@archsim/sim-engine';
import { formatUsd } from '../format';
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
  const result = useSim((s) => s.result);
  const rows = result ? evaluate(result, requirements) : [];
  const met = rows.filter((r) => r.pass).length;
  return (
    <section className="panel evaluation" aria-label="Avaliação">
      <header>
        <h2>Requisitos</h2>
        <p className="muted">
          {result ? `${met} de ${rows.length} atendidos` : 'Simulando…'} · o score sai ao finalizar
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
                <span className="sr-only">{r.pass ? ' — atendido' : ' — não atendido'}</span>
              </span>
              <span className="num req-values">
                {line.measured} <span className="muted">(alvo {line.target})</span>
              </span>
            </li>
          );
        })}
      </ul>
      {result && (
        <p className="num cost-now">Custo atual: {formatUsd(result.global.costMonth)}/mês</p>
      )}
      <button type="button" className="button primary" disabled={busy} onClick={onFinalize}>
        {busy ? 'Pontuando…' : 'Finalizar e pontuar'}
      </button>
      {error && (
        <p className="field-error" role="alert">
          Não consegui gravar a sessão: {error}
        </p>
      )}
    </section>
  );
}
