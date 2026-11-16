import type { History, ProblemSummary } from '@archsim/problems';
import { useEffect, useState } from 'react';
import type { Key } from '../i18n/pt';
import { useLang } from '../i18n/store';
import { tr, useT } from '../i18n/t';
import { hrefOf } from '../routes';
import { loadSaved } from '../store/autosave';
import { Achievements } from './Achievements';
import { api, ApiError } from './api';
import { difficultyLabel, starsText } from './format-req';

export type ProblemStatus = 'não iniciado' | 'em andamento' | 'finalizado';

export function statusOf(p: ProblemSummary, hasDraft: boolean): ProblemStatus {
  if (p.attempts > 0) return 'finalizado';
  return hasDraft ? 'em andamento' : 'não iniciado';
}

const STATUS_KEY: Record<ProblemStatus, Key> = {
  'não iniciado': 'pstatus.notStarted',
  'em andamento': 'pstatus.inProgress',
  finalizado: 'pstatus.done',
};

export function ProblemList() {
  const t = useT();
  const lang = useLang();
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    api.problems().then(setProblems, (e: unknown) => {
      setError(e instanceof ApiError ? e.message : tr('list.loadError'));
    });
    api.history().then(setHistory, () => {
      setHistory(null);
    });
  }, []);

  if (error) return <p className="page field-error">{t('list.failed', { error })}</p>;
  if (!problems) return <p className="page muted">{t('list.loading')}</p>;

  return (
    <section className="page problem-list" aria-labelledby="problems-title">
      <h2 id="problems-title">{t('list.title')}</h2>
      <p className="muted">{t('list.lead')}</p>
      <ul>
        {problems.map((p) => {
          const status = statusOf(p, loadSaved({ kind: 'problem', problemId: p.id }) !== null);
          return (
            <li key={p.id} className="problem-row">
              <a className="problem-card" href={hrefOf({ screen: 'problem', problemId: p.id })}>
                <span className="problem-title">{lang === 'en' ? p.titleEn : p.title}</span>
                <span className="muted">{difficultyLabel(p.difficulty, lang)}</span>
                <span className="problem-status">{t(STATUS_KEY[status])}</span>
                {p.record !== null && (
                  <span className="num">
                    {t('list.record', { score: p.record })}{' '}
                    <span aria-label={t('list.stars', { n: p.stars ?? 0 })}>
                      {starsText(p.stars ?? 0)}
                    </span>
                  </span>
                )}
              </a>
              <a
                className="button study-link"
                href={hrefOf({ screen: 'study', problemId: p.id })}
                aria-label={t('list.studyWith', { title: lang === 'en' ? p.titleEn : p.title })}
              >
                {t('list.study')}
              </a>
            </li>
          );
        })}
      </ul>
      {history && <Achievements history={history} />}
    </section>
  );
}
