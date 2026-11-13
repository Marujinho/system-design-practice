import type { Catalog } from '@archsim/catalog';
import { score, type Diagram, type ScoreResult } from '@archsim/sim-engine';
import type { Problem } from './schema';

/** The problem's load always wins: the user cannot change it (FR-44). */
export function withProblemLoad(diagram: Diagram, problem: Problem): Diagram {
  return { ...diagram, load: { classes: problem.load.classes.map((c) => ({ ...c })) } };
}

export function scoreAttempt(args: {
  problem: Problem;
  reference: Diagram;
  diagram: Diagram;
  catalog: Catalog;
  ticks?: number;
}): ScoreResult {
  return score({
    diagram: withProblemLoad(args.diagram, args.problem),
    reference: withProblemLoad(args.reference, args.problem),
    requirements: args.problem.quantitative,
    catalog: args.catalog,
    scoring: args.problem.scoring,
    ...(args.ticks === undefined ? {} : { ticks: args.ticks }),
  });
}
