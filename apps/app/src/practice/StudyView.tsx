import type { FinalizeResponse, PublicProblem } from '@archsim/problems';
import { useEffect, useState } from 'react';
import { LoadPanel } from '../panels/LoadPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { hrefOf } from '../routes';
import { problemStart } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
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
  const [problem, setProblem] = useState<PublicProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'req' | 'props'>('req');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResponse | null>(null);

  useEffect(() => {
    setProblem(null);
    setResult(null);
    api.problem(problemId).then(setProblem, (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'não consegui carregar o problema');
    });
  }, [problemId]);

  if (error) return <p className="page field-error">Não consegui carregar o problema: {error}</p>;
  if (!problem) return <p className="page muted">Carregando problema…</p>;

  const finalize = () => {
    setBusy(true);
    setSaveError(null);
    api.studyScore(problem.id, useDiagram.getState().diagram).then(
      (r) => {
        setResult(r);
        setBusy(false);
      },
      (e: unknown) => {
        setSaveError(e instanceof ApiError ? e.message : 'erro desconhecido');
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
            <strong>{problem.title}</strong> <span className="study-badge">Modo estudo</span>
          </>
        }
        top={
          <>
            <p className="study-banner" role="note">
              <span className="study-badge">Modo estudo</span> não conta para a nota ·{' '}
              <a href={hrefOf({ screen: 'problem', problemId: problem.id })}>praticar valendo</a>
            </p>
            <Brief problem={problem} />
            <LoadPanel />
          </>
        }
        side={
          <>
            <div className="tabs" role="tablist" aria-label="Painel">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'req'}
                onClick={() => {
                  setTab('req');
                }}
              >
                Requisitos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'props'}
                onClick={() => {
                  setTab('props');
                }}
              >
                Propriedades
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
