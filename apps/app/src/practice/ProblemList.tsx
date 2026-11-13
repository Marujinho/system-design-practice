import type { History, ProblemSummary } from '@archsim/problems';
import { useEffect, useState } from 'react';
import { hrefOf } from '../routes';
import { loadSaved } from '../store/autosave';
import { Achievements } from './Achievements';
import { api, ApiError } from './api';
import { DIFFICULTY, starsText } from './format-req';

export type ProblemStatus = 'não iniciado' | 'em andamento' | 'finalizado';

export function statusOf(p: ProblemSummary, hasDraft: boolean): ProblemStatus {
  if (p.attempts > 0) return 'finalizado';
  return hasDraft ? 'em andamento' : 'não iniciado';
}

export function ProblemList() {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    api.problems().then(setProblems, (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'não consegui carregar os problemas');
    });
    api.history().then(setHistory, () => {
      setHistory(null);
    });
  }, []);

  if (error) return <p className="page field-error">Não consegui carregar os problemas: {error}</p>;
  if (!problems) return <p className="page muted">Carregando problemas…</p>;

  return (
    <section className="page problem-list" aria-labelledby="problems-title">
      <h2 id="problems-title">Problemas</h2>
      <p className="muted">
        Atenda a todos os requisitos pelo menor custo. O score sai quando você finaliza.
      </p>
      <ul>
        {problems.map((p) => {
          const status = statusOf(p, loadSaved({ kind: 'problem', problemId: p.id }) !== null);
          return (
            <li key={p.id}>
              <a className="problem-card" href={hrefOf({ screen: 'problem', problemId: p.id })}>
                <span className="problem-title">{p.title}</span>
                <span className="muted">{DIFFICULTY[p.difficulty]}</span>
                <span className="problem-status">{status}</span>
                {p.record !== null && (
                  <span className="num">
                    recorde {p.record}{' '}
                    <span aria-label={`${p.stars ?? 0} de 3 estrelas`}>
                      {starsText(p.stars ?? 0)}
                    </span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      {history && <Achievements history={history} />}
    </section>
  );
}
