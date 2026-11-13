import type { Catalog } from '@archsim/catalog';
import {
  buildSession,
  recordOf,
  scoreAttempt,
  toPublic,
  withProblemLoad,
  type FinalizeResponse,
  type ProblemSummary,
} from '@archsim/problems';
import { loadAllProblems, type LoadedProblem } from '@archsim/problems/load';
import { safeJsonParse, validateDiagram } from '@archsim/sim-engine';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  checkCaller,
  checkMethod,
  logRefusal,
  PREFIX,
  readJsonBody,
  Refusal,
  sendJson,
} from './guard';
import { practiceStore } from './practice-store';

export interface PracticeOptions {
  practiceDir: string;
  problemsDir: string;
  catalog: Catalog;
  now?: () => Date;
  log?: (line: string) => void;
}

type Next = (err?: unknown) => void;

const ID = /^[a-z][a-z0-9-]{0,63}$/;

/** Connect middleware for /__archsim/* (dev and preview servers). Everything else passes through. */
export function createPracticeHandler(options: PracticeOptions) {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console.warn;
  const store = practiceStore(options.practiceDir, log);
  let cache: Map<string, LoadedProblem> | null = null;
  const problems = () => {
    cache ??= new Map(
      loadAllProblems(options.problemsDir, options.catalog).map((p) => [p.problem.id, p]),
    );
    return cache;
  };
  const problemOf = (id: string | undefined): LoadedProblem => {
    const p = id !== undefined && ID.test(id) ? problems().get(id) : undefined;
    if (!p) throw new Refusal(404, 'problema não existe');
    return p;
  };

  const summary = (p: LoadedProblem): ProblemSummary => {
    const h = store.readHistory();
    const best = recordOf(h, p.problem.id);
    return {
      id: p.problem.id,
      title: p.problem.title,
      difficulty: p.problem.difficulty,
      record: best?.score ?? null,
      stars: best?.stars ?? null,
      attempts: h.attempts.filter((a) => a.problemId === p.problem.id).length,
      solutionAvailable: h.attempts.some((a) => a.problemId === p.problem.id),
    };
  };

  async function finalize(req: IncomingMessage, res: ServerResponse) {
    checkMethod(req, 'POST');
    const text = await readJsonBody(req);
    let body: unknown;
    try {
      body = safeJsonParse(text);
    } catch {
      throw new Refusal(400, 'JSON inválido');
    }
    const { problemId, diagram } = (body ?? {}) as { problemId?: unknown; diagram?: unknown };
    const loaded = problemOf(typeof problemId === 'string' ? problemId : undefined);
    const checked = validateDiagram(diagram, options.catalog);
    if (!checked.ok) throw new Refusal(400, `diagrama inválido: ${checked.code}`);

    const { problem, reference } = loaded;
    const attemptDiagram = withProblemLoad(checked.diagram, problem);
    const scored = scoreAttempt({
      problem,
      reference,
      diagram: attemptDiagram,
      catalog: options.catalog,
    });
    const before = store.readHistory();
    const solutionSeen = before.solutionViewedAt[problem.id] !== undefined;
    const previous = recordOf(before, problem.id)?.score ?? null;
    const at = now().toISOString();

    const session = buildSession({
      problemId: problem.id,
      diagram: attemptDiagram,
      scored,
      solutionSeen,
      readyAt: at,
    });
    store.writeSession(session);
    store.appendAttempt({
      problemId: problem.id,
      at,
      score: scored.total,
      stars: scored.stars,
      cost: scored.userCost,
      belowReference: scored.belowReference,
      solutionSeen,
    });
    const response: FinalizeResponse = {
      problemId: problem.id,
      score: session.score,
      requirements: session.requirements,
      findings: session.findings,
      isRecord: !solutionSeen && (previous === null || scored.total > previous),
      previousRecord: previous,
    };
    sendJson(res, 200, response);
  }

  function reference(req: IncomingMessage, res: ServerResponse, id: string | undefined) {
    checkMethod(req, 'GET');
    const loaded = problemOf(id);
    const h = store.readHistory();
    // The solution stays on the server until the problem has been finalized once (FR-46, A06).
    if (!h.attempts.some((a) => a.problemId === loaded.problem.id)) {
      throw new Refusal(403, 'finalize o problema antes de ver a solução');
    }
    store.markSolutionViewed(loaded.problem.id, now().toISOString());
    sendJson(res, 200, withProblemLoad(loaded.reference, loaded.problem));
  }

  return async function practice(
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ): Promise<void> {
    const url = req.url ?? '';
    if (!url.startsWith(PREFIX)) {
      next();
      return;
    }
    const path = url.slice(PREFIX.length).split('?')[0] ?? '';
    const parts = path.split('/');
    try {
      checkCaller(req, req.socket.localPort ?? 0);
      switch (parts[0]) {
        case 'problems':
          checkMethod(req, 'GET');
          if (parts.length === 1) {
            sendJson(res, 200, [...problems().values()].map(summary));
          } else {
            sendJson(res, 200, toPublic(problemOf(parts[1]).problem));
          }
          return;
        case 'history':
          checkMethod(req, 'GET');
          sendJson(res, 200, store.readHistory());
          return;
        case 'finalize':
          await finalize(req, res);
          return;
        case 'reference':
          reference(req, res, parts[1]);
          return;
        default:
          throw new Refusal(404, 'rota desconhecida');
      }
    } catch (error) {
      if (error instanceof Refusal) {
        logRefusal(req, error, log);
        sendJson(res, error.status, { error: error.reason });
        return;
      }
      log(
        `[archsim] erro interno em ${req.method ?? '?'} ${url}: ${error instanceof Error ? error.message : 'desconhecido'}`,
      );
      sendJson(res, 500, { error: 'não consegui gravar a sessão' });
    }
  };
}
