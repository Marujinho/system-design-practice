import { Diagram, Metric } from '@archsim/sim-engine';
import { z } from 'zod';

export const RequirementResultSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    metric: Metric,
    class: z.string().optional(),
    op: z.enum(['<=', '>=']),
    measured: z.number(),
    target: z.number(),
    unit: z.string(),
    pass: z.boolean(),
  })
  .strict();

export const FindingSchema = z
  .object({
    type: z.enum([
      'bottleneck',
      'requirement-failed',
      'overprovisioned',
      'no-traffic',
      'invalid-connection',
      'breaks-under-load',
    ]),
    nodeIds: z.array(z.string()),
    message: z.string(),
    numbers: z.record(z.string(), z.number()),
    impact: z.number(),
  })
  .strict();

export const ScoreSummary = z
  .object({
    total: z.number().int().min(0).max(100),
    stars: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    parts: z.object({ requirements: z.number(), cost: z.number(), headroom: z.number() }).strict(),
    allPass: z.boolean(),
    passAt15: z.boolean(),
    passAt2: z.boolean(),
    userCost: z.number(),
    referenceCost: z.number(),
    belowReference: z.boolean(),
    solutionSeen: z.boolean(),
  })
  .strict();
export type ScoreSummary = z.infer<typeof ScoreSummary>;

export const GlobalSummary = z
  .object({
    rpsIn: z.number(),
    errorRps: z.number(),
    errorRate: z.number(),
    costMonth: z.number(),
    p50ByClass: z.record(z.string(), z.number()),
    p99ByClass: z.record(z.string(), z.number()),
    throughputByClass: z.record(z.string(), z.number()),
    bottleneckId: z.string().nullable(),
  })
  .strict();

/** `practice/session.json`: the attempt the agent reads (FR-47). */
export const Session = z
  .object({
    schemaVersion: z.literal(1),
    problemId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    status: z.literal('ready'),
    readyAt: z.iso.datetime(),
    diagram: Diagram,
    simulation: z.object({ global: GlobalSummary }).strict(),
    score: ScoreSummary,
    requirements: z.array(RequirementResultSchema),
    findings: z.array(FindingSchema),
  })
  .strict();
export type Session = z.infer<typeof Session>;

export const Attempt = z
  .object({
    problemId: z.string(),
    at: z.iso.datetime(),
    score: z.number().int().min(0).max(100),
    stars: z.number().int().min(0).max(3),
    cost: z.number().nonnegative(),
    belowReference: z.boolean(),
    solutionSeen: z.boolean(),
  })
  .strict();
export type Attempt = z.infer<typeof Attempt>;

/** `practice/history.json` (FR-59). */
export const History = z
  .object({
    schemaVersion: z.literal(1),
    attempts: z.array(Attempt),
    solutionViewedAt: z.record(z.string(), z.iso.datetime()),
  })
  .strict();
export type History = z.infer<typeof History>;

export function emptyHistory(): History {
  return { schemaVersion: 1, attempts: [], solutionViewedAt: {} };
}

/** Best score per problem, ignoring attempts made after seeing the solution. */
export function recordOf(history: History, problemId: string): Attempt | undefined {
  return history.attempts
    .filter((a) => a.problemId === problemId && !a.solutionSeen)
    .reduce<Attempt | undefined>(
      (best, a) => (best === undefined || a.score > best.score ? a : best),
      undefined,
    );
}

export const NodeSummary = z
  .object({
    serviceId: z.string(),
    kind: z.string().nullable(),
    rpsIn: z.number(),
    rpsOut: z.number(),
    errorRps: z.number(),
    errorRate: z.number(),
    utilization: z.number(),
    capacity: z.number(),
    p50: z.number(),
    p99: z.number(),
    costMonth: z.number(),
    backlog: z.number().optional(),
    queueAgeS: z.number().optional(),
    health: z.string(),
  })
  .strict();

export const ApplicableFollowup = z
  .object({
    id: z.string(),
    question: z.string(),
    loadMultiplier: z.number().optional(),
    lookFor: z.array(z.string()),
    topic: z.string().optional(),
  })
  .strict();

/** What `pnpm archsim` prints. Text written by the user only ever appears under `userContent`. */
export const CliOutput = z
  .object({
    problemId: z.string().optional(),
    ticks: z.number().int(),
    loadMultiplier: z.number(),
    nodes: z.record(z.string(), NodeSummary),
    global: GlobalSummary,
    requirements: z.array(RequirementResultSchema).optional(),
    score: ScoreSummary.omit({ solutionSeen: true }).optional(),
    findings: z.array(FindingSchema).optional(),
    warnings: z.array(
      z
        .object({
          code: z.string(),
          nodeId: z.string().optional(),
          edgeId: z.string().optional(),
          message: z.string(),
        })
        .strict(),
    ),
    applicableFollowups: z.array(ApplicableFollowup).optional(),
    userContent: z
      .object({
        labels: z.record(z.string(), z.string()),
        diagramName: z.string().optional(),
        /** The ids the person wrote, keyed by the neutral ids used everywhere else. */
        ids: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
  })
  .strict();
export type CliOutput = z.infer<typeof CliOutput>;

/** What POST /__archsim/finalize answers: the reference only as a number (FR-58). */
export const FinalizeResponse = z
  .object({
    problemId: z.string(),
    score: ScoreSummary,
    requirements: z.array(RequirementResultSchema),
    findings: z.array(FindingSchema),
    isRecord: z.boolean(),
    previousRecord: z.number().int().nullable(),
  })
  .strict();
export type FinalizeResponse = z.infer<typeof FinalizeResponse>;

export const ProblemSummary = z
  .object({
    id: z.string(),
    title: z.string(),
    difficulty: z.enum(['facil', 'medio', 'dificil']),
    record: z.number().int().nullable(),
    stars: z.number().int().min(0).max(3).nullable(),
    attempts: z.number().int().nonnegative(),
    solutionAvailable: z.boolean(),
  })
  .strict();
export type ProblemSummary = z.infer<typeof ProblemSummary>;
