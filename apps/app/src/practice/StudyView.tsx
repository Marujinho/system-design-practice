import type { FinalizeResponse, PublicProblem } from '@archsim/problems';
import { useEffect, useRef, useState } from 'react';
import { tr, useT } from '../i18n/t';
import { LoadPanel } from '../panels/LoadPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { hrefOf } from '../routes';
import { problemStart } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { useLayout } from '../workspace/layout-store';
import { Workspace } from '../workspace/Workspace';
import { api, ApiError } from './api';
import { EvaluationPanel } from './EvaluationPanel';
import { Brief } from './ProblemView';
import { ChatPanel } from './ChatPanel';
import { MentorLauncher } from './MentorLauncher';
import { ResultScreen } from './ResultScreen';

/**
 * The problem in study mode: the same canvas and requirements, a draft of its
 * own, and a score that is shown but never recorded (study-mode FR-1, FR-9).
 */
export function StudyView({ problemId }: { problemId: string }) {
  const t = useT();
  const [problem, setProblem] = useState<PublicProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'req' | 'props'>('req');
  // A double click on a card asks for its properties (mentor-edits FR-14).
  // Only requests made after this screen opened count, not one left from another screen.
  const propertiesRequest = useLayout((s) => s.propertiesRequest);
  const requestAtMount = useRef(propertiesRequest);
  useEffect(() => {
    if (propertiesRequest !== requestAtMount.current) setTab('props');
  }, [propertiesRequest]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResponse | null>(null);

  useEffect(() => {
    setProblem(null);
    setResult(null);
    api.problem(problemId).then(setProblem, (e: unknown) => {
      setError(e instanceof ApiError ? e.message : tr('problem.loadError'));
    });
  }, [problemId]);

  if (error) return <p className="page field-error">{t('problem.failed', { error })}</p>;
  if (!problem) return <p className="page muted">{t('problem.loading')}</p>;

  const finalize = () => {
    setBusy(true);
    setSaveError(null);
    api.studyScore(problem.id, useDiagram.getState().diagram).then(
      (r) => {
        setResult(r);
        setBusy(false);
      },
      (e: unknown) => {
        setSaveError(e instanceof ApiError ? e.message : tr('problem.unknownError'));
        setBusy(false);
      },
    );
  };

  return (
    <>
      <Workspace
        mode={{ kind: 'study', problemId: problem.id }}
        initial={() => problemStart(problem.load)}
        chat={{ panel: <ChatPanel problemId={problem.id} />, launcher: <MentorLauncher /> }}
        topSummary={
          <>
            <strong>{problem.title}</strong> <span className="study-badge">{t('study.badge')}</span>
          </>
        }
        top={
          <>
            <p className="study-banner" role="note">
              <span className="study-badge">{t('study.badge')}</span> {t('study.noScore')} ·{' '}
              <a href={hrefOf({ screen: 'problem', problemId: problem.id })}>
                {t('study.forReal')}
              </a>
            </p>
            <Brief problem={problem} />
            <LoadPanel />
          </>
        }
        side={
          <>
            <div className="tabs" role="tablist" aria-label={t('problem.panel')}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'req'}
                onClick={() => {
                  setTab('req');
                }}
              >
                {t('problem.requirements')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'props'}
                onClick={() => {
                  setTab('props');
                }}
              >
                {t('problem.properties')}
              </button>
            </div>
            {tab === 'req' ? (
              <EvaluationPanel
                requirements={problem.quantitative}
                onFinalize={finalize}
                busy={busy}
                error={saveError}
              />
            ) : (
              <PropertiesPanel />
            )}
          </>
        }
      />
      {result && (
        <ResultScreen
          result={result}
          study
          onClose={() => {
            setResult(null);
          }}
        />
      )}
    </>
  );
}
