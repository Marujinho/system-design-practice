import { catalog as bundledCatalog, type Catalog } from '@archsim/catalog';
import { parseDiagram, type Diagram } from '@archsim/sim-engine';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { Problem } from './schema';

/** The repository's `problems/` directory. */
export const PROBLEMS_DIR = resolve(fileURLToPath(new URL('../../../problems', import.meta.url)));

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
  dir: string;
}

export function loadProblem(
  dir: string,
  catalog: Catalog = bundledCatalog,
): LoadResult<LoadedProblem> {
  const problemPath = join(dir, 'problem.yaml');
  const referencePath = join(dir, 'reference.archsim.json');
  if (!existsSync(problemPath)) return { ok: false, message: `${problemPath} não existe` };
  if (!existsSync(referencePath)) return { ok: false, message: `${referencePath} não existe` };
  const problem = parseProblem(readFileSync(problemPath, 'utf8'));
  if (!problem.ok) return { ok: false, message: `${problemPath}:\n${problem.message}` };
  const reference = parseDiagram(readFileSync(referencePath, 'utf8'), catalog);
  if (!reference.ok) return { ok: false, message: `${referencePath}: ${reference.message}` };
  return { ok: true, value: { problem: problem.value, reference: reference.diagram, dir } };
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
