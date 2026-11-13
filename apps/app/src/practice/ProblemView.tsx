import type { FinalizeResponse, PublicProblem } from '@archsim/problems';
import type { Diagram } from '@archsim/sim-engine';
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { LoadPanel } from '../panels/LoadPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { hrefOf } from '../routes';
import { problemStart } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { Workspace } from '../workspace/Workspace';
import { api, ApiError } from './api';
import { DIFFICULTY } from './format-req';
import { EvaluationPanel } from './EvaluationPanel';
import { ResultScreen } from './ResultScreen';
import { SolutionView } from './SolutionView';

/** Markdown without raw HTML, images or anything that loads (PRD §12 A05). */
const ALLOWED = ['p', 'strong', 'em', 'code', 'ul', 'ol', 'li', 'br'];

function Brief({ problem }: { problem: PublicProblem }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="brief" aria-label="Enunciado">
      <div className="brief-head">
        <a href={hrefOf({ screen: 'problems' })} className="muted">
          Problemas
        </a>
        <h2>{problem.title}</h2>
        <span className="muted">{DIFFICULTY[problem.difficulty]}</span>
        <button
          type="button"
          className="link-button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'esconder enunciado' : 'mostrar enunciado'}
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
            <h3>Funcionalidades</h3>
            <ul>
              {problem.functional.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="note">
              Regra do jogo: atender a todos os requisitos pelo menor custo mensal.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProblemView({ problemId }: { problemId: string }) {
  const [problem, setProblem] = useState<PublicProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'req' | 'props'>('req');
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
      setError(e instanceof ApiError ? e.message : 'não consegui carregar o problema');
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

  if (error) return <p className="page field-error">Não consegui carregar o problema: {error}</p>;
  if (!problem) return <p className="page muted">Carregando problema…</p>;

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
        setSaveError(e instanceof ApiError ? e.message : 'erro desconhecido');
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
        setSaveError(e instanceof ApiError ? e.message : 'não consegui abrir a solução');
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
                      Ver uma solução
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
