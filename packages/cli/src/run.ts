import { catalog as bundledCatalog, type Catalog } from '@archsim/catalog';
import {
  ApplicableFollowup,
  CliOutput,
  evaluateWhen,
  scoreAttempt,
  Session,
  withProblemLoad,
  type Problem,
} from '@archsim/problems';
import { loadProblem, PROBLEMS_DIR } from '@archsim/problems/load';
import {
  evaluate,
  parseDiagram,
  safeJsonParse,
  simulateSteady,
  type Diagram,
} from '@archsim/sim-engine';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { z } from 'zod';
import { parseArgs, type Args } from './args';
import { neutralIds, summarize } from './output';

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Record<string, string | undefined>;
  problemsDir?: string;
  catalog?: Catalog;
}

const MAX_BYTES = 5 * 1024 * 1024;

class CliError extends Error {}

export function practiceDir(env: Record<string, string | undefined>): string {
  return env.ARCHSIM_PRACTICE_DIR ?? resolve(PROBLEMS_DIR, '..', 'practice');
}

function readText(path: string, what: string): string {
  if (!existsSync(path)) throw new CliError(`${what} não encontrado: ${path}`);
  const st = statSync(path);
  // a FIFO or a device reports size 0 and could stream forever
  if (!st.isFile()) throw new CliError(`${what} não é um arquivo comum: ${path}`);
  if (st.size > MAX_BYTES) throw new CliError(`${what} passa de 5 MB: ${path}`);
  return readFileSync(path, 'utf8');
}

const NO_SESSION =
  'nenhuma sessão pronta: no app, abra um problema e clique em Finalizar e pontuar';

function readSession(path: string): z.infer<typeof Session> {
  if (!existsSync(path)) throw new CliError(NO_SESSION);
  let raw: unknown;
  try {
    raw = safeJsonParse(readText(path, 'sessão'));
  } catch {
    throw new CliError(`a sessão não é um JSON válido: ${path}`);
  }
  const status =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).status : undefined;
  if (status !== 'ready') throw new CliError(`${NO_SESSION} (status atual: ${String(status)})`);
  const parsed = Session.safeParse(raw);
  if (!parsed.success)
    throw new CliError(`a sessão está fora do formato esperado (${path}); finalize de novo no app`);
  return parsed.data;
}

function problemById(
  id: string,
  io: Io,
  catalog: Catalog,
): { problem: Problem; reference: Diagram } {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new CliError(`problema inválido: ${id}`);
  const dir = join(io.problemsDir ?? PROBLEMS_DIR, id);
  if (!existsSync(join(dir, 'problem.yaml'))) throw new CliError(`problema não existe: ${id}`);
  const r = loadProblem(dir, catalog);
  if (!r.ok) throw new CliError(r.message);
  return { problem: r.value.problem, reference: r.value.reference };
}

interface Target {
  diagram: Diagram;
  problem?: { problem: Problem; reference: Diagram };
}

function resolveTarget(args: Args, io: Io, catalog: Catalog): Target {
  if (args.diagram !== undefined) {
    const r = parseDiagram(readText(resolve(io.cwd, args.diagram), 'diagrama'), catalog);
    if (!r.ok) throw new CliError(`diagrama inválido: ${r.message}`);
    return args.problem === undefined
      ? { diagram: r.diagram }
      : { diagram: r.diagram, problem: problemById(args.problem, io, catalog) };
  }
  const sessionPath =
    args.session === undefined
      ? join(practiceDir(io.env), 'session.json')
      : resolve(io.cwd, args.session);
  const session = readSession(sessionPath);
  // The stored simulation and score are not trusted: everything is recomputed from the diagram.
  const checked = parseDiagram(JSON.stringify(session.diagram), catalog);
  if (!checked.ok) throw new CliError(`o diagrama da sessão é inválido: ${checked.message}`);
  return {
    diagram: checked.diagram,
    problem: problemById(args.problem ?? session.problemId, io, catalog),
  };
}

function execute(args: Args, io: Io, catalog: Catalog): CliOutput {
  const resolved = resolveTarget(args, io, catalog);
  const neutral = neutralIds(resolved.diagram);
  const target: Target = { ...resolved, diagram: neutral.diagram };
  if (!target.problem) {
    const sim = simulateSteady(target.diagram, catalog, {
      ticks: args.ticks,
      loadMultiplier: args.loadMultiplier,
    });
    return summarize({
      diagram: target.diagram,
      catalog,
      sim,
      ticks: args.ticks,
      loadMultiplier: args.loadMultiplier,
    });
  }
  const { problem, reference } = target.problem;
  const diagram = withProblemLoad(target.diagram, problem);
  const scored = scoreAttempt({ problem, reference, diagram, catalog, ticks: args.ticks });
  const sim =
    args.loadMultiplier === 1
      ? scored.simulation
      : simulateSteady(diagram, catalog, {
          ticks: args.ticks,
          loadMultiplier: args.loadMultiplier,
        });
  const requirements =
    args.loadMultiplier === 1 ? scored.requirements : evaluate(sim, problem.quantitative);
  const out = summarize({
    diagram,
    catalog,
    sim,
    ticks: args.ticks,
    loadMultiplier: args.loadMultiplier,
    problemId: problem.id,
    requirements,
    score: scored,
    findings: scored.findings,
    ids: neutral.ids,
  });
  if (args.command === 'followups') {
    out.applicableFollowups = problem.followups
      .filter((f) => evaluateWhen(f.when, diagram, scored.simulation, scored.requirements))
      .map((f) =>
        ApplicableFollowup.parse({
          id: f.id,
          question: f.question,
          lookFor: f.lookFor,
          ...(f.loadMultiplier === undefined ? {} : { loadMultiplier: f.loadMultiplier }),
          ...(f.topic === undefined ? {} : { topic: f.topic }),
        }),
      );
  }
  return CliOutput.parse(out);
}

/** Entry point. Returns the exit code; JSON goes to stdout, errors to stderr in Portuguese. */
export function run(argv: readonly string[], io: Io): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n`);
    return 1;
  }
  try {
    const out = execute(parsed.args, io, io.catalog ?? bundledCatalog);
    io.stdout(`${JSON.stringify(out, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      io.stderr(`archsim: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
