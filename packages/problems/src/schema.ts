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
  })
  .strict();
export type PublicProblem = z.infer<typeof PublicProblem>;

export function toPublic(p: Problem): PublicProblem {
  return {
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    statement: p.statement,
    functional: [...p.functional],
    quantitative: p.quantitative.map((r) => ({ ...r })),
    load: { classes: p.load.classes.map((c) => ({ ...c })) },
  };
}

export { Diagram };
