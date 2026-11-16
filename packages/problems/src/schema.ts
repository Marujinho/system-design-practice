import { Diagram, Load, Requirement, Scoring } from '@archsim/sim-engine';
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** `global.<metric>[.<class>]` or `kind:<kind>.<metric>` (max over nodes of that kind). */
export const METRIC_PATH =
  /^(global\.(errorRate|costMonth|rpsIn|(p50ByClass|p99ByClass|throughputByClass)\.[a-z][a-z0-9-]*)|kind:[a-z-]+\.(utilization|errorRate|errorRps|p50|p99|queueAgeS|backlog|rpsIn|costMonth))$/;

export const When = z
  .object({
    hasService: z.array(z.string()).min(1).optional(),
    missingService: z.array(z.string()).min(1).optional(),
    metric: z
      .object({
        path: z.string().regex(METRIC_PATH),
        op: z.enum(['<', '<=', '>', '>=']),
        value: z.number(),
      })
      .strict()
      .optional(),
    requirementFails: z.string().optional(),
  })
  .strict()
  .refine((w) => Object.keys(w).length > 0, { message: 'when vazio' });
export type When = z.infer<typeof When>;

export const Followup = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
    question: z.string().min(10).max(500),
    when: When.optional(),
    loadMultiplier: z.number().min(1).max(1000).optional(),
    lookFor: z.array(z.string().min(3)).min(1),
    topic: z.enum(['qualitative']).optional(),
  })
  .strict();
export type Followup = z.infer<typeof Followup>;

export const Difficulty = z.enum(['facil', 'medio', 'dificil']);

export const Problem = z
  .object({
    id: Slug,
    title: z.string().min(3).max(80),
    difficulty: Difficulty,
    statement: z.string().min(50).max(5000),
    functional: z.array(z.string().min(3)).min(1),
    quantitative: z.array(Requirement).min(1),
    load: Load,
    qualitative: z.array(z.string().min(3)).min(1),
    followups: z.array(Followup).min(6),
    scoring: Scoring.optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const f of p.followups) {
      if (!f.id.startsWith(`${p.id}.`)) {
        ctx.addIssue({
          code: 'custom',
          path: ['followups'],
          message: `follow-up ${f.id} deve começar com ${p.id}.`,
        });
      }
      if (ids.has(f.id))
        ctx.addIssue({
          code: 'custom',
          path: ['followups'],
          message: `follow-up repetido: ${f.id}`,
        });
      ids.add(f.id);
    }
    // FR-49 minimum mix.
    const bySim = p.followups.filter(
      (f) => f.when?.metric !== undefined || f.when?.requirementFails !== undefined,
    );
    if (bySim.length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['followups'],
        message: 'precisa de ≥ 1 follow-up condicionado à simulação',
      });
    }
    if (!p.followups.some((f) => f.loadMultiplier !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['followups'],
        message: 'precisa de ≥ 1 follow-up com loadMultiplier',
      });
    }
    if (!p.followups.some((f) => f.topic === 'qualitative')) {
      ctx.addIssue({
        code: 'custom',
        path: ['followups'],
        message: 'precisa de ≥ 1 follow-up qualitativo',
      });
    }
    const classes = new Set(p.load.classes.map((c) => c.name));
    const reqIds = new Set<string>();
    for (const r of p.quantitative) {
      if (r.class !== undefined && !classes.has(r.class)) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantitative'],
          message: `classe desconhecida em ${r.id}: ${r.class}`,
        });
      }
      reqIds.add(r.id);
    }
    for (const f of p.followups) {
      const ref = f.when?.requirementFails;
      if (ref !== undefined && !reqIds.has(ref)) {
        ctx.addIssue({
          code: 'custom',
          path: ['followups'],
          message: `${f.id} cita requisito inexistente: ${ref}`,
        });
      }
    }
  });
export type Problem = z.infer<typeof Problem>;

/**
 * A problem's texts in English, next to `problem.yaml` as `problem.en.yaml`
 * (language-switch FR-7). Ids, numbers and the load stay in `problem.yaml`.
 */
export const ProblemText = z
  .object({
    title: z.string().min(3).max(80),
    statement: z.string().min(50).max(5000),
    functional: z.array(z.string().min(3)).min(1),
    qualitative: z.array(z.string().min(3)).min(1),
    /** Quantitative requirement labels, by requirement id. */
    requirements: z.record(z.string(), z.string().min(1).max(120)),
    /** Load class labels, by class name. */
    classes: z.record(z.string(), z.string().min(1).max(80)),
    followups: z.record(
      z.string(),
      z
        .object({
          question: z.string().min(10).max(500),
          lookFor: z.array(z.string().min(3)).min(1),
        })
        .strict(),
    ),
    /** Labels of the reference diagram's nodes, by node id; shown only after a finalization. */
    referenceLabels: z.record(z.string(), z.string().min(1).max(80)),
  })
  .strict();
export type ProblemText = z.infer<typeof ProblemText>;

/** Where `text` does not match `problem` and its reference one to one; empty when it does. */
export function problemTextGaps(
  problem: Problem,
  referenceNodeIds: readonly string[],
  text: ProblemText,
): string[] {
  const gaps: string[] = [];
  const same = (what: string, expected: readonly string[], actual: readonly string[]) => {
    const a = new Set(actual);
    const e = new Set(expected);
    for (const k of expected) if (!a.has(k)) gaps.push(`${what}: falta ${k}`);
    for (const k of actual) if (!e.has(k)) gaps.push(`${what}: sobra ${k}`);
  };
  same(
    'requirements',
    problem.quantitative.map((r) => r.id),
    Object.keys(text.requirements),
  );
  same(
    'classes',
    problem.load.classes.map((c) => c.name),
    Object.keys(text.classes),
  );
  same(
    'followups',
    problem.followups.map((f) => f.id),
    Object.keys(text.followups),
  );
  same('referenceLabels', referenceNodeIds, Object.keys(text.referenceLabels));
  if (text.functional.length !== problem.functional.length)
    gaps.push(
      `functional: ${String(text.functional.length)} itens, esperado ${String(problem.functional.length)}`,
    );
  if (text.qualitative.length !== problem.qualitative.length)
    gaps.push(
      `qualitative: ${String(text.qualitative.length)} itens, esperado ${String(problem.qualitative.length)}`,
    );
  for (const f of problem.followups) {
    const t = text.followups[f.id];
    if (t && t.lookFor.length !== f.lookFor.length)
      gaps.push(
        `followups.${f.id}.lookFor: ${String(t.lookFor.length)} itens, esperado ${String(f.lookFor.length)}`,
      );
  }
  return gaps;
}

/** The texts the browser may see before a finalization, in English (FR-44 still holds). */
export const PublicProblemText = z
  .object({
    title: z.string(),
    statement: z.string(),
    functional: z.array(z.string()),
    requirements: z.record(z.string(), z.string()),
    classes: z.record(z.string(), z.string()),
  })
  .strict();
export type PublicProblemText = z.infer<typeof PublicProblemText>;

/** What the browser may see before a finalization: no follow-ups, no scoring, no topics (FR-44). */
export const PublicProblem = z
  .object({
    id: Slug,
    title: z.string(),
    difficulty: Difficulty,
    statement: z.string(),
    functional: z.array(z.string()),
    quantitative: z.array(Requirement),
    load: Load,
    en: PublicProblemText,
  })
  .strict();
export type PublicProblem = z.infer<typeof PublicProblem>;

export function toPublic(p: Problem, en: ProblemText): PublicProblem {
  return {
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    statement: p.statement,
    functional: [...p.functional],
    quantitative: p.quantitative.map((r) => ({ ...r })),
    load: { classes: p.load.classes.map((c) => ({ ...c })) },
    // only what the Portuguese side already shows: no follow-ups, qualitative items or reference labels
    en: {
      title: en.title,
      statement: en.statement,
      functional: [...en.functional],
      requirements: { ...en.requirements },
      classes: { ...en.classes },
    },
  };
}

export { Diagram };
