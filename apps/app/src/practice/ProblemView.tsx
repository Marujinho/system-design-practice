import type { FinalizeResponse, PublicProblem } from '@archsim/problems';
import type { Diagram } from '@archsim/sim-engine';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { useLang } from '../i18n/store';
import { tr, useT } from '../i18n/t';
import { LoadPanel } from '../panels/LoadPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { hrefOf } from '../routes';
import { problemStart } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { useLayout } from '../workspace/layout-store';
import { Workspace } from '../workspace/Workspace';
import { api, ApiError } from './api';
import { difficultyLabel } from './format-req';
import { EvaluationPanel } from './EvaluationPanel';
import { ResultScreen } from './ResultScreen';
import { SolutionView } from './SolutionView';

/** Markdown without raw HTML, images or anything that loads (PRD §12 A05). */
const ALLOWED = ['p', 'strong', 'em', 'code', 'ul', 'ol', 'li', 'br'];

export function Brief({ problem }: { problem: PublicProblem }) {
  const [open, setOpen] = useState(true);
  const t = useT();
  const lang = useLang();
  return (
    <section className="brief" aria-label={t('brief.label')}>
      <div className="brief-head">
        <a href={hrefOf({ screen: 'problems' })} className="muted">
          {t('list.title')}
        </a>
        <h2>{problem.title}</h2>
        <span className="muted">{difficultyLabel(problem.difficulty, lang)}</span>
        <button
          type="button"
          className="link-button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {t(open ? 'brief.hide' : 'brief.show')}
        </button>
      </div>
      {open && (
        <div className="brief-body">
          <div className="statement">
            <Markdown allowedElements={ALLOWED} skipHtml unwrapDisallowed>
              {problem.statement}
            </Markdown>
          </div>
          <div>
            <h3>{t('brief.functional')}</h3>
            <ul>
              {problem.functional.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="note">{t('brief.rule')}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProblemView({ problemId }: { problemId: string }) {
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
  const [canSeeSolution, setCanSeeSolution] = useState(false);
  const [solution, setSolution] = useState<Diagram | null>(null);

  useEffect(() => {
    setProblem(null);
    setResult(null);
    setSolution(null);
    api.problem(problemId).then(setProblem, (e: unknown) => {
      setError(e instanceof ApiError ? e.message : tr('problem.loadError'));
    });
    api.problems().then(
      (list) => {
        setCanSeeSolution(list.find((p) => p.id === problemId)?.solutionAvailable ?? false);
      },
      () => {
        setCanSeeSolution(false);
      },
    );
  }, [problemId]);

  if (error) return <p className="page field-error">{t('problem.failed', { error })}</p>;
  if (!problem) return <p className="page muted">{t('problem.loading')}</p>;

  const finalize = () => {
    setBusy(true);
    setSaveError(null);
    api.finalize(problem.id, useDiagram.getState().diagram).then(
      (r) => {
        setResult(r);
        setCanSeeSolution(true);
        setBusy(false);
      },
      (e: unknown) => {
        setSaveError(e instanceof ApiError ? e.message : tr('problem.unknownError'));
        setBusy(false);
      },
    );
  };

  const openSolution = () => {
    api.reference(problem.id).then(
      (d) => {
        setResult(null);
        setSolution(d);
      },
      (e: unknown) => {
        setSaveError(e instanceof ApiError ? e.message : tr('problem.solutionError'));
      },
    );
  };

  return (
    <>
      <Workspace
        mode={{ kind: 'problem', problemId: problem.id }}
        initial={() => problemStart(problem.load)}
        topSummary={<strong>{problem.title}</strong>}
        top={
          <>
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
              <>
                <EvaluationPanel
                  requirements={problem.quantitative}
                  onFinalize={finalize}
                  busy={busy}
                  error={saveError}
                />
                {canSeeSolution && (
                  <div className="panel">
                    <button type="button" className="button" onClick={openSolution}>
                      {t('problem.seeSolution')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <PropertiesPanel />
            )}
          </>
        }
      />
      {result && (
        <ResultScreen
          result={result}
          onClose={() => {
            setResult(null);
          }}
          onSolution={openSolution}
        />
      )}
      {solution && (
        <SolutionView
          reference={solution}
          onClose={() => {
            setSolution(null);
          }}
        />
      )}
    </>
  );
}
