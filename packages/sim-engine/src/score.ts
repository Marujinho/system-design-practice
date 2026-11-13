import type { Catalog } from '@archsim/catalog';
import { z } from 'zod';
import type { Diagram } from './diagram';
import { findings as findFindings, type Finding } from './findings';
import { evaluate, type Requirement, type RequirementResult } from './requirements';
import { simulateSteady } from './simulate';
import type { SimResult } from './step';

export const Scoring = z
  .object({
    failCap: z.number().min(0).max(100).optional(),
    base: z.number().min(0).max(100).optional(),
    cost: z.number().min(0).max(100).optional(),
    headroom15: z.number().min(0).max(100).optional(),
    headroom2: z.number().min(0).max(100).optional(),
  })
  .strict();
export type Scoring = z.infer<typeof Scoring>;

export const DEFAULT_SCORING = {
  failCap: 40,
  base: 50,
  cost: 35,
  headroom15: 7.5,
  headroom2: 7.5,
} as const;
export const STARS = { one: 50, two: 75, three: 90 } as const;
export const SCORE_TICKS = 600;

export interface ScoreParts {
  requirements: number;
  cost: number;
  headroom: number;
}

export interface ScoreResult {
  total: number;
  stars: 0 | 1 | 2 | 3;
  parts: ScoreParts;
  allPass: boolean;
  passAt15: boolean;
  passAt2: boolean;
  userCost: number;
  referenceCost: number;
  belowReference: boolean;
  requirements: RequirementResult[];
  findings: Finding[];
  simulation: SimResult;
}

/** Round half up, immune to float noise (92.5 → 93). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

export function starsFor(total: number): 0 | 1 | 2 | 3 {
  if (total >= STARS.three) return 3;
  if (total >= STARS.two) return 2;
  if (total >= STARS.one) return 1;
  return 0;
}

export interface ScoreInputs {
  requirements: readonly RequirementResult[];
  passAt15: boolean;
  passAt2: boolean;
  userCost: number;
  referenceCost: number;
  scoring?: Scoring | undefined;
}

/** The FR-55 formula, separated from simulation so its arithmetic is testable. */
export function computeScore(inputs: ScoreInputs): {
  total: number;
  parts: ScoreParts;
  allPass: boolean;
} {
  const o = inputs.scoring ?? {};
  const w = {
    failCap: o.failCap ?? DEFAULT_SCORING.failCap,
    base: o.base ?? DEFAULT_SCORING.base,
    cost: o.cost ?? DEFAULT_SCORING.cost,
    headroom15: o.headroom15 ?? DEFAULT_SCORING.headroom15,
    headroom2: o.headroom2 ?? DEFAULT_SCORING.headroom2,
  };
  const total = inputs.requirements.length;
  const passed = inputs.requirements.filter((r) => r.pass).length;
  const allPass = passed === total;
  if (!allPass) {
    const req = total > 0 ? (w.failCap * passed) / total : 0;
    return { total: roundHalfUp(req), parts: { requirements: req, cost: 0, headroom: 0 }, allPass };
  }
  const ratio = inputs.userCost > 0 ? Math.min(1, inputs.referenceCost / inputs.userCost) : 1;
  const cost = w.cost * ratio;
  const headroom = (inputs.passAt15 ? w.headroom15 : 0) + (inputs.passAt2 ? w.headroom2 : 0);
  return {
    total: Math.min(100, roundHalfUp(w.base + cost + headroom)),
    parts: { requirements: w.base, cost, headroom },
    allPass,
  };
}

export interface ScoreArgs {
  diagram: Diagram;
  reference: Diagram;
  requirements: readonly Requirement[];
  catalog: Catalog;
  scoring?: Scoring | undefined;
  ticks?: number;
}

/** Simulate at 1×, 1.5× and 2× the problem load, compare with the reference, score and explain. */
export function score(args: ScoreArgs): ScoreResult {
  const ticks = args.ticks ?? SCORE_TICKS;
  const at1 = simulateSteady(args.diagram, args.catalog, { ticks });
  const at15 = simulateSteady(args.diagram, args.catalog, { ticks, loadMultiplier: 1.5 });
  const at2 = simulateSteady(args.diagram, args.catalog, { ticks, loadMultiplier: 2 });
  const ref = simulateSteady(args.reference, args.catalog, { ticks });

  const requirements = evaluate(at1, args.requirements);
  const req15 = evaluate(at15, args.requirements);
  const req2 = evaluate(at2, args.requirements);
  const passAt15 = req15.every((r) => r.pass);
  const passAt2 = req2.every((r) => r.pass);
  const userCost = at1.global.costMonth;
  const referenceCost = ref.global.costMonth;

  const { total, parts, allPass } = computeScore({
    requirements,
    passAt15,
    passAt2,
    userCost,
    referenceCost,
    scoring: args.scoring,
  });

  return {
    total,
    stars: starsFor(total),
    parts,
    allPass,
    passAt15,
    passAt2,
    userCost,
    referenceCost,
    belowReference: allPass && userCost < referenceCost,
    requirements,
    findings: findFindings({
      diagram: args.diagram,
      catalog: args.catalog,
      at1,
      at15,
      at2,
      requirements,
      req15,
      req2,
    }),
    simulation: at1,
  };
}
