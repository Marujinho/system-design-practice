import type { Catalog } from '@archsim/catalog';
import {
  buildSession,
  recordOf,
  scoreAttempt,
  toPublic,
  withProblemLoad,
  FinalizeResponse,
  ScoreSummary,
  type History,
  type ProblemSummary,
} from '@archsim/problems';
import { loadAllProblems, type LoadedProblem } from '@archsim/problems/load';
import { safeJsonParse, validateDiagram } from '@archsim/sim-engine';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  checkCaller,
  checkMethod,
  clean,
  logRefusal,
  PREFIX,
  readJsonBody,
  Refusal,
  sendJson,
} from './guard';
import { mentorRoutes, type MentorOptions } from './mentor/chat-route';
import { practiceStore } from './practice-store';

export interface PracticeOptions {
  practiceDir: string;
  problemsDir: string;
  catalog: Catalog;
  now?: () => Date;
  log?: (line: string) => void;
  /** The study-mode mentor; without it, no provider is available. */
  mentor?: MentorOptions;
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

  const mentor = mentorRoutes({
    store,
    problemOf,
    catalog: options.catalog,
    mentor: options.mentor,
    now,
    log,
  });

  /** One history read per request, shared by every row. */
  const summary = (p: LoadedProblem, h: History): ProblemSummary => {
    const best = recordOf(h, p.problem.id);
    return {
      id: p.problem.id,
      title: p.problem.title,
      titleEn: p.en.title,
      difficulty: p.problem.difficulty,
      record: best?.score ?? null,
      stars: best?.stars ?? null,
      attempts: h.attempts.filter((a) => a.problemId === p.problem.id).length,
      solutionAvailable: h.attempts.some((a) => a.problemId === p.problem.id),
    };
  };

  /** Parses `{ problemId, diagram }`, validates the diagram and scores it under the problem's load. */
  async function scoreBody(req: IncomingMessage) {
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
    const attemptDiagram = withProblemLoad(checked.diagram, loaded.problem);
    const scored = scoreAttempt({
      problem: loaded.problem,
      reference: loaded.reference,
      diagram: attemptDiagram,
      catalog: options.catalog,
      en: loaded.en,
    });
    return { problem: loaded.problem, attemptDiagram, scored };
  }

  async function finalize(req: IncomingMessage, res: ServerResponse) {
    const { problem, attemptDiagram, scored } = await scoreBody(req);
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

  /**
   * Study mode: the same score, recorded nowhere. No session, no attempt, no
   * record — this path never touches the practice store (study-mode FR-9, FR-10, A06).
   */
  async function studyScore(req: IncomingMessage, res: ServerResponse) {
    const { problem, scored } = await scoreBody(req);
    const response: FinalizeResponse = {
      problemId: problem.id,
      score: ScoreSummary.parse({
        total: scored.total,
        stars: scored.stars,
        parts: scored.parts,
        allPass: scored.allPass,
        passAt15: scored.passAt15,
        passAt2: scored.passAt2,
        userCost: scored.userCost,
        referenceCost: scored.referenceCost,
        belowReference: scored.belowReference,
        solutionSeen: false,
      }),
      requirements: scored.requirements,
      findings: scored.findings,
      isRecord: false,
      previousRecord: null,
    };
    sendJson(res, 200, FinalizeResponse.parse(response));
  }

  /** `?lang=en` gives the reference's node labels in English; anything else, Portuguese (A05). */
  function reference(
    req: IncomingMessage,
    res: ServerResponse,
    id: string | undefined,
    english: boolean,
  ) {
    checkMethod(req, 'GET');
    const loaded = problemOf(id);
    const h = store.readHistory();
    // The solution stays on the server until the problem has been finalized once (FR-46, A06).
    if (!h.attempts.some((a) => a.problemId === loaded.problem.id)) {
      throw new Refusal(403, 'finalize o problema antes de ver a solução');
    }
    store.markSolutionViewed(loaded.problem.id, now().toISOString());
    const shown = withProblemLoad(loaded.reference, loaded.problem);
    sendJson(
      res,
      200,
      english
        ? {
            ...shown,
            nodes: shown.nodes.map((n) => ({
              ...n,
              label: loaded.en.referenceLabels[n.id] ?? n.label,
            })),
            load: {
              classes: shown.load.classes.map((c) => ({
                ...c,
                label: loaded.en.classes[c.name] ?? c.label,
              })),
            },
          }
        : shown,
    );
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
            const h = store.readHistory();
            sendJson(
              res,
              200,
              [...problems().values()].map((p) => summary(p, h)),
            );
          } else {
            const loaded = problemOf(parts[1]);
            sendJson(res, 200, toPublic(loaded.problem, loaded.en));
          }
          return;
        case 'history':
          checkMethod(req, 'GET');
          sendJson(res, 200, store.readHistory());
          return;
        case 'finalize':
          await finalize(req, res);
          return;
        case 'study-score':
          await studyScore(req, res);
          return;
        case 'mentor':
          if (parts[1] !== 'status' || parts.length !== 2)
            throw new Refusal(404, 'rota desconhecida');
          await mentor.status(req, res);
          return;
        case 'conversation':
          mentor.conversation(req, res, parts[1]);
          return;
        case 'chat':
          await mentor.chat(req, res);
          return;
        case 'proposal':
          await mentor.proposalStatus(req, res);
          return;
        case 'reference':
          reference(
            req,
            res,
            parts[1],
            new URLSearchParams(url.split('?')[1] ?? '').get('lang') === 'en',
          );
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
        `[archsim] erro interno em ${clean(req.method)} ${clean(url)}: ${error instanceof Error ? error.message : 'desconhecido'}`,
      );
      sendJson(res, 500, { error: 'não consegui gravar a sessão' });
    }
  };
}
