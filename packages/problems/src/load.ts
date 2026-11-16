import { catalog as bundledCatalog, type Catalog } from '@archsim/catalog';
import { parseDiagram, type Diagram } from '@archsim/sim-engine';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { Problem, ProblemText, problemTextGaps } from './schema';

/** The repository's `problems/` directory: next to this package, or up from the working directory. */
function locateProblems(): string {
  // A string, not a URL object: jsdom replaces the global URL, which Node's fileURLToPath rejects.
  if (import.meta.url.startsWith('file:')) {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'problems');
  }
  // Non-file module URLs (some test environments): find the workspace root instead.
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return join(dir, 'problems');
    dir = resolve(dir, '..');
  }
  return resolve(process.cwd(), 'problems');
}

export const PROBLEMS_DIR = locateProblems();

export type LoadResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * YAML in the core schema: plain data only. Unknown tags (`!!js/function`),
 * aliases beyond a small budget, and duplicate keys are errors (PRD §12 A05).
 */
export function parseYaml(text: string): LoadResult<unknown> {
  const doc = parseDocument(text, { schema: 'core', uniqueKeys: true, prettyErrors: true });
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length > 0) return { ok: false, message: problems.map((e) => e.message).join('\n') };
  return { ok: true, value: doc.toJS({ maxAliasCount: 10 }) };
}

export function parseProblem(text: string): LoadResult<Problem> {
  const yaml = parseYaml(text);
  if (!yaml.ok) return yaml;
  const parsed = Problem.safeParse(yaml.value);
  if (!parsed.success) return { ok: false, message: z.prettifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}

export interface LoadedProblem {
  problem: Problem;
  reference: Diagram;
  /** The problem's texts in English (language-switch FR-7). */
  en: ProblemText;
  dir: string;
}

/** `problem.en.yaml`: plain YAML, the schema, then one-to-one with the problem and its reference. */
export function parseProblemText(
  text: string,
  problem: Problem,
  referenceNodeIds: readonly string[],
): LoadResult<ProblemText> {
  const yaml = parseYaml(text);
  if (!yaml.ok) return yaml;
  const parsed = ProblemText.safeParse(yaml.value);
  if (!parsed.success) return { ok: false, message: z.prettifyError(parsed.error) };
  const gaps = problemTextGaps(problem, referenceNodeIds, parsed.data);
  if (gaps.length > 0) return { ok: false, message: gaps.join('\n') };
  return { ok: true, value: parsed.data };
}

export function loadProblem(
  dir: string,
  catalog: Catalog = bundledCatalog,
): LoadResult<LoadedProblem> {
  const problemPath = join(dir, 'problem.yaml');
  const referencePath = join(dir, 'reference.archsim.json');
  const textPath = join(dir, 'problem.en.yaml');
  if (!existsSync(problemPath)) return { ok: false, message: `${problemPath} não existe` };
  if (!existsSync(referencePath)) return { ok: false, message: `${referencePath} não existe` };
  if (!existsSync(textPath)) return { ok: false, message: `${textPath} não existe` };
  const problem = parseProblem(readFileSync(problemPath, 'utf8'));
  if (!problem.ok) return { ok: false, message: `${problemPath}:\n${problem.message}` };
  const reference = parseDiagram(readFileSync(referencePath, 'utf8'), catalog);
  if (!reference.ok) return { ok: false, message: `${referencePath}: ${reference.message}` };
  const en = parseProblemText(
    readFileSync(textPath, 'utf8'),
    problem.value,
    reference.diagram.nodes.map((n) => n.id),
  );
  if (!en.ok) return { ok: false, message: `${textPath}:\n${en.message}` };
  return {
    ok: true,
    value: { problem: problem.value, reference: reference.diagram, en: en.value, dir },
  };
}

/** Every problem directory (names starting with `_` are fixtures). */
export function problemDirs(root: string = PROBLEMS_DIR): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .map((name) => join(root, name))
    .filter((p) => statSync(p).isDirectory())
    .sort();
}

export function loadAllProblems(
  root: string = PROBLEMS_DIR,
  catalog: Catalog = bundledCatalog,
): LoadedProblem[] {
  return problemDirs(root).map((dir) => {
    const r = loadProblem(dir, catalog);
    if (!r.ok) throw new Error(r.message);
    return r.value;
  });
}
