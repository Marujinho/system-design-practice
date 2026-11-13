import { catalog } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import type { Diagram } from './diagram';
import { evaluate, type Requirement, type RequirementResult } from './requirements';
import { computeScore, roundHalfUp, score, starsFor } from './score';
import { simulateSteady } from './simulate';
import { diagram, edge, node, READ, WRITE } from './test-helpers';

const pass = (id: string): RequirementResult => ({
  id,
  label: id,
  metric: 'errorRate',
  op: '<=',
  measured: 0,
  target: 0,
  unit: '',
  pass: true,
});
const fail = (id: string): RequirementResult => ({ ...pass(id), pass: false });

describe('computeScore (FR-55)', () => {
  it('3 of 4 requirements → 30', () => {
    const r = computeScore({
      requirements: [pass('a'), pass('b'), pass('c'), fail('d')],
      passAt15: true,
      passAt2: true,
      userCost: 1,
      referenceCost: 1,
    });
    expect(r.total).toBe(30);
    expect(r.allPass).toBe(false);
  });

  it('all pass, same cost as the reference, ok at 1.5×, fails at 2× → 92.5 → 93', () => {
    const r = computeScore({
      requirements: [pass('a')],
      passAt15: true,
      passAt2: false,
      userCost: 100,
      referenceCost: 100,
    });
    expect(r.parts).toEqual({ requirements: 50, cost: 35, headroom: 7.5 });
    expect(r.total).toBe(93);
  });

  it('all pass at twice the reference cost, no headroom → 67.5 → 68', () => {
    const r = computeScore({
      requirements: [pass('a')],
      passAt15: false,
      passAt2: false,
      userCost: 200,
      referenceCost: 100,
    });
    expect(r.parts.cost).toBeCloseTo(17.5, 9);
    expect(r.total).toBe(68);
  });

  it('caps the cost part at 35 when cheaper than the reference', () => {
    const r = computeScore({
      requirements: [pass('a')],
      passAt15: true,
      passAt2: true,
      userCost: 50,
      referenceCost: 100,
    });
    expect(r.parts.cost).toBe(35);
    expect(r.total).toBe(100);
  });

  it('applies per-problem weight overrides', () => {
    const r = computeScore({
      requirements: [pass('a')],
      passAt15: false,
      passAt2: false,
      userCost: 100,
      referenceCost: 100,
      scoring: { base: 40, cost: 45 },
    });
    expect(r.total).toBe(85);
  });

  it('rounds half up', () => {
    expect(roundHalfUp(92.5)).toBe(93);
    expect(roundHalfUp(67.5)).toBe(68);
    expect(roundHalfUp(67.49)).toBe(67);
  });
});

describe('starsFor (FR-56)', () => {
  it.each([
    [49, 0],
    [50, 1],
    [74, 1],
    [75, 2],
    [89, 2],
    [90, 3],
  ] as const)('%s → %s stars', (total, stars) => {
    expect(starsFor(total)).toBe(stars);
  });
});

const users = node('users', 'core.users', 'default');
const classes = [
  { ...READ, rps: 1000 },
  { ...WRITE, rps: 100 },
];
const reqs: Requirement[] = [
  {
    id: 'reads',
    label: 'Leituras',
    metric: 'throughput',
    class: 'read',
    op: '>=',
    value: 1000,
    unit: 'req/s',
  },
  { id: 'errors', label: 'Erros', metric: 'errorRate', op: '<=', value: 0.001, unit: '' },
];

function app(units: number, variant = 't3.micro'): Diagram {
  return diagram(
    [
      users,
      node('app', 'aws.ec2', variant, { units }),
      node('db', 'aws.rds-postgres', 'db.t4g.small'),
    ],
    [edge('users', 'app'), edge('app', 'db', { classes: ['write'] })],
    classes,
  );
}

describe('score', () => {
  const reference = app(9);

  it('gives the reference against itself ≥ 90 and 3 stars', () => {
    const s = score({ diagram: reference, reference, requirements: reqs, catalog, ticks: 5 });
    expect(s.allPass).toBe(true);
    expect(s.total).toBeGreaterThanOrEqual(90);
    expect(s.stars).toBe(3);
    expect(s.belowReference).toBe(false);
  });

  it('awards the below-reference badge when cheaper and passing', () => {
    const cheaper = app(2, 'm5.large');
    const ref = app(20);
    const s = score({ diagram: cheaper, reference: ref, requirements: reqs, catalog, ticks: 5 });
    expect(s.allPass).toBe(true);
    expect(s.userCost).toBeLessThan(s.referenceCost);
    expect(s.belowReference).toBe(true);
  });

  it('is deterministic', () => {
    const a = score({ diagram: app(3), reference, requirements: reqs, catalog, ticks: 5 });
    const b = score({ diagram: app(3), reference, requirements: reqs, catalog, ticks: 5 });
    expect(a).toEqual(b);
  });
});

describe('findings (FR-57)', () => {
  const types = (d: Diagram, ref: Diagram = app(9)) =>
    score({ diagram: d, reference: ref, requirements: reqs, catalog, ticks: 5 }).findings;

  it('names the bottleneck first, with the requirement it breaks', () => {
    const f = types(app(1));
    expect(f[0]?.type).toBe('bottleneck');
    expect(f[0]?.nodeIds).toEqual(['app']);
    expect(f[0]?.message).toContain('Leituras');
    expect(f.some((x) => x.type === 'requirement-failed')).toBe(true);
  });

  it('flags an overprovisioned node with the estimated saving', () => {
    const big = app(10, 'm5.large');
    const f = types(big).find((x) => x.type === 'overprovisioned' && x.nodeIds[0] === 'app');
    expect(f).toBeDefined();
    // 1,100 req/s / (10 × 800) = ρ 0.1375 → ceil(10 × 0.1375 / 0.7) = 2 instances; save 8 × 0.096 × 730
    expect(f?.numbers.saving).toBeCloseTo(8 * 0.096 * 730, 6);
    expect(f?.message).toContain('de 10 para 2');
  });

  it('suggests a smaller variant when the node has no unit count', () => {
    const d = diagram(
      [
        users,
        node('app', 'aws.ec2', 'm5.large', { units: 2 }),
        node('db', 'aws.rds-postgres', 'db.m7g.large'),
      ],
      [edge('users', 'app'), edge('app', 'db', { classes: ['write'] })],
      classes,
    );
    const f = types(d).find((x) => x.type === 'overprovisioned' && x.nodeIds[0] === 'db');
    expect(f?.message).toContain('db.t4g.micro');
  });

  it('flags a node without traffic that still costs', () => {
    const d = app(9);
    d.nodes.push(node('idle', 'aws.ec2', 'm5.large'));
    expect(types(d).find((x) => x.type === 'no-traffic')?.nodeIds).toEqual(['idle']);
  });

  it('flags an invalid connection', () => {
    const d = diagram(
      [
        users,
        node('app', 'aws.ec2', 't3.micro', { units: 9 }),
        node('s3', 'aws.s3', 'standard'),
        node('db', 'aws.rds-postgres', 'db.t4g.small'),
      ],
      [edge('users', 'app'), edge('app', 's3'), edge('s3', 'db')],
      classes,
    );
    expect(types(d).some((x) => x.type === 'invalid-connection')).toBe(true);
  });

  it('flags the first node to saturate under more load', () => {
    const tight = app(6);
    const f = types(tight);
    expect(evaluate(simulateSteady(tight, catalog, { ticks: 5 }), reqs).every((r) => r.pass)).toBe(
      true,
    );
    const breaks = f.find((x) => x.type === 'breaks-under-load');
    expect(breaks?.nodeIds).toEqual(['app']);
    expect(breaks?.numbers.multiplier).toBe(1.5);
  });

  it('orders findings by impact', () => {
    const f = types(app(1));
    const impacts = f.map((x) => x.impact);
    expect([...impacts].sort((a, b) => b - a)).toEqual(impacts);
  });
});

describe('evaluate (FR-42 metrics)', () => {
  it('measures p99 per class, cost and queue age', () => {
    const d = diagram(
      [users, node('q', 'aws.sqs', 'standard'), node('w', 'aws.ec2', 't3.micro')],
      [edge('users', 'q'), edge('q', 'w')],
      [{ ...READ, rps: 300 }],
    );
    const r = simulateSteady(d, catalog, { ticks: 50 });
    const out = evaluate(r, [
      { id: 'age', label: 'Idade', metric: 'queueAge', op: '<=', value: 1, unit: 's' },
      { id: 'stable', label: 'Fila estável', metric: 'queueStable', op: '<=', value: 0, unit: '' },
      { id: 'cost', label: 'Custo', metric: 'costMonth', op: '<=', value: 1000, unit: 'US$' },
      { id: 'p99', label: 'p99', metric: 'p99', class: 'read', op: '<=', value: 1000, unit: 'ms' },
    ]);
    expect(out.find((x) => x.id === 'age')?.pass).toBe(false);
    expect(out.find((x) => x.id === 'stable')?.pass).toBe(false);
    expect(out.find((x) => x.id === 'cost')?.pass).toBe(true);
    expect(out.find((x) => x.id === 'p99')?.pass).toBe(true);
  });
});
