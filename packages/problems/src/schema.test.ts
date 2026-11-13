import { describe, expect, it } from 'vitest';
import { parseProblem, parseYaml } from './load';
import { Problem, toPublic } from './schema';
import { recordOf, emptyHistory } from './contracts';

function base() {
  return {
    id: 'demo',
    title: 'Demo',
    difficulty: 'facil',
    statement:
      'Um enunciado de exemplo com texto suficiente para passar no mínimo exigido pelo schema.',
    functional: ['Encurtar URLs'],
    quantitative: [
      {
        id: 'reads',
        label: 'Leituras',
        metric: 'throughput',
        class: 'read',
        op: '>=',
        value: 100,
        unit: 'req/s',
      },
    ],
    load: {
      classes: [
        {
          name: 'read',
          label: 'Leitura',
          mode: 'rps',
          op: 'read',
          rps: 100,
          payloadKB: 1,
          cacheable: true,
        },
      ],
    },
    qualitative: ['Consistência'],
    followups: [
      {
        id: 'demo.a',
        question: 'O que acontece se o banco cair?',
        lookFor: ['réplica'],
        topic: 'qualitative',
      },
      {
        id: 'demo.b',
        question: 'E se a carga dobrar amanhã?',
        loadMultiplier: 2,
        lookFor: ['escala'],
      },
      {
        id: 'demo.c',
        question: 'Seu p99 passou do alvo. Por quê?',
        when: { requirementFails: 'reads' },
        lookFor: ['cache'],
      },
      { id: 'demo.d', question: 'Por que este banco e não outro?', lookFor: ['trade-off'] },
      {
        id: 'demo.e',
        question: 'Como você invalidaria o cache?',
        when: { hasService: ['aws.elasticache-valkey'] },
        lookFor: ['TTL'],
      },
      {
        id: 'demo.f',
        question: 'O banco está quase saturado. E agora?',
        when: { metric: { path: 'kind:sql-database.utilization', op: '>', value: 0.8 } },
        lookFor: ['réplicas'],
      },
    ],
  };
}

describe('Problem schema (FR-41, FR-49)', () => {
  it('accepts a minimal valid problem', () => {
    const r = Problem.safeParse(base());
    expect(r.success).toBe(true);
  });

  it('requires at least 6 follow-ups', () => {
    const p = base();
    p.followups = p.followups.slice(0, 5);
    expect(Problem.safeParse(p).success).toBe(false);
  });

  it('requires a follow-up conditioned on the simulation', () => {
    const p: Record<string, unknown> = {
      ...base(),
      followups: base().followups.map(({ when: _when, ...f }) => f),
    };
    expect(Problem.safeParse(p).success).toBe(false);
  });

  it('requires a follow-up with loadMultiplier', () => {
    const p = base();
    p.followups = p.followups.map(({ loadMultiplier: _drop, ...f }) => f);
    expect(Problem.safeParse(p).success).toBe(false);
  });

  it('requires a qualitative follow-up', () => {
    const p = base();
    p.followups = p.followups.map(({ topic: _drop, ...f }) => f);
    expect(Problem.safeParse(p).success).toBe(false);
  });

  it('rejects a metric the engine does not measure', () => {
    const p = base();
    p.quantitative = [
      { ...p.quantitative[0], metric: 'availability' } as (typeof p.quantitative)[number],
    ];
    expect(Problem.safeParse(p).success).toBe(false);
  });

  it('rejects a follow-up id outside the problem namespace', () => {
    const p = base();
    p.followups[0] = { ...p.followups[0], id: 'other.a' } as (typeof p.followups)[number];
    expect(Problem.safeParse(p).success).toBe(false);
  });

  it('rejects a requirementFails that names no requirement', () => {
    const p = base();
    p.followups[2] = {
      ...p.followups[2],
      when: { requirementFails: 'nope' },
    } as (typeof p.followups)[number];
    expect(Problem.safeParse(p).success).toBe(false);
  });

  it('rejects an unknown metric path', () => {
    const p = base();
    p.followups[5] = {
      ...p.followups[5],
      when: { metric: { path: 'process.env.SECRET', op: '>', value: 0 } },
    } as (typeof p.followups)[number];
    expect(Problem.safeParse(p).success).toBe(false);
  });
});

describe('YAML parsing (A05)', () => {
  it('refuses custom tags such as !!js/function', () => {
    const r = parseYaml('x: !!js/function "function () { return 1 }"\n');
    expect(r.ok).toBe(false);
  });

  it('refuses duplicate keys', () => {
    expect(parseYaml('a: 1\na: 2\n').ok).toBe(false);
  });

  it('parses plain data', () => {
    expect(parseYaml('a: [1, 2]\n')).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it('parses a whole problem from YAML text', () => {
    const yaml = JSON.stringify(base());
    expect(parseProblem(yaml).ok).toBe(true);
  });
});

describe('toPublic (FR-44)', () => {
  it('drops follow-ups, lookFor, scoring and qualitative topics', () => {
    const p = Problem.parse({ ...base(), scoring: { base: 40 } });
    const text = JSON.stringify(toPublic(p));
    expect(text).not.toContain('followups');
    expect(text).not.toContain('lookFor');
    expect(text).not.toContain('TTL');
    expect(text).not.toContain('scoring');
    expect(text).not.toContain('Consistência');
  });
});

describe('recordOf (FR-59)', () => {
  it('ignores attempts made after seeing the solution', () => {
    const h = emptyHistory();
    const at = '2026-11-13T10:00:00.000Z';
    for (const [score, solutionSeen] of [
      [60, false],
      [85, false],
      [70, false],
      [95, true],
    ] as const) {
      h.attempts.push({
        problemId: 'demo',
        at,
        score,
        stars: 2,
        cost: 1,
        belowReference: false,
        solutionSeen,
      });
    }
    expect(recordOf(h, 'demo')?.score).toBe(85);
    expect(recordOf(h, 'other')).toBeUndefined();
  });
});
