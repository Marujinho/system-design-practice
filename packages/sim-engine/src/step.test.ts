import { catalog, parseCatalog, type Catalog } from '@archsim/catalog';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { simulateSteady } from './simulate';
import { healthOf } from './state';
import { initialState, step } from './step';
import { diagram, edge, fixtureText, node, READ } from './test-helpers';

const users = node('users', 'core.users', 'default');
const load = (rps: number) => [{ ...READ, name: 'default', rps }];

function run(d: ReturnType<typeof diagram>, c: Catalog = catalog) {
  return step(initialState(), d, c, 100).result;
}

describe('step: golden scenarios', () => {
  it('FR-17/FR-26: 16,666.7 req/s through EC2 t3.micro × 2 into RDS', () => {
    const d = diagram(
      [
        users,
        node('app', 'aws.ec2', 't3.micro', { units: 2 }),
        node('db', 'aws.rds-postgres', 'db.t4g.micro'),
      ],
      [edge('users', 'app'), edge('app', 'db', { protocol: 'tcp' })],
      [{ ...READ, name: 'default', mode: 'users', users: 100_000, reqPerUserPerMin: 10 }],
    );
    const r = run(d);
    const app = r.nodes.app;
    expect(app?.rpsIn).toBeCloseTo(16_666.67, 1);
    expect(app?.utilization).toBeCloseTo(41.667, 2);
    expect(app?.errorRate).toBeCloseTo(0.976, 3);
    expect(app?.costMonth).toBeCloseTo(15.184, 6);
    expect(r.nodes.db?.rpsIn).toBeCloseTo(400, 6);
    expect(r.global.bottleneckId).toBe('app');
    expect(app?.health).toBe('bottleneck');
  });

  it('aws-instance-types FR-9a: a bigger type clears the bottleneck at the same load', () => {
    const at = (variantId: string) =>
      run(
        diagram(
          [users, node('app', 'aws.ec2', variantId, { units: 1 })],
          [edge('users', 'app')],
          load(1500),
        ),
      );
    const small = at('t3.micro');
    expect(small.global.bottleneckId).toBe('app');
    expect(small.nodes.app?.health).toBe('bottleneck');
    expect(small.nodes.app?.utilization).toBeCloseTo(1500 / 200, 6);
    expect(small.nodes.app?.errorRps).toBeGreaterThan(0);

    const big = at('c5.xlarge');
    expect(big.nodes.app?.utilization).toBeCloseTo(1500 / 2000, 6);
    expect(big.nodes.app?.errorRps).toBe(0);
    expect(big.nodes.app?.health).not.toBe('bottleneck');
    // the same load, divided by each type's capacity
    expect((small.nodes.app?.utilization ?? 0) / (big.nodes.app?.utilization ?? 1)).toBeCloseTo(
      2000 / 200,
      6,
    );
  });

  it('FR-10: a 100 req/s chain reaches every node in one tick', () => {
    const d = diagram(
      [users, node('alb', 'aws.alb', 'alb'), node('app', 'aws.ec2', 'm5.large')],
      [edge('users', 'alb'), edge('alb', 'app')],
      load(100),
    );
    const r = run(d);
    expect(r.nodes.alb?.rpsIn).toBe(100);
    expect(r.nodes.app?.rpsIn).toBe(100);
  });

  it('FR-27: picks the highest utilization as bottleneck', () => {
    const d = diagram(
      [
        users,
        node('alb', 'aws.alb', 'alb'),
        node('app', 'aws.ec2', 't3.micro', { units: 1 }),
        node('db', 'aws.rds-postgres', 'db.t4g.micro'),
      ],
      [edge('users', 'alb'), edge('alb', 'app'), edge('app', 'db')],
      load(280),
    );
    const r = run(d);
    expect(r.global.bottleneckId).toBe('app');
  });

  it('FR-27: breaks a utilization tie by the node closest to the entry', () => {
    const d = diagram(
      [users, node('a', 'aws.ec2', 't3.micro'), node('b', 'aws.ec2', 't3.micro')],
      [edge('users', 'a'), edge('a', 'b')],
      load(100),
    );
    expect(run(d).global.bottleneckId).toBe('a');
  });

  it('FR-27: end-to-end latency is the slowest path with traffic', () => {
    const d = diagram(
      [
        users,
        node('app', 'aws.ec2', 'm5.large'),
        node('cache', 'aws.elasticache-valkey', 'cache.t4g.micro'),
        node('db', 'aws.rds-postgres', 'db.m7g.large'),
      ],
      [
        edge('users', 'app'),
        edge('app', 'cache', { weight: 0.8 }),
        edge('app', 'db', { weight: 0.2 }),
      ],
      load(400),
    );
    const r = run(d);
    const viaDb = (r.nodes.app?.p50 ?? 0) + (r.nodes.db?.p50 ?? 0);
    const viaCache = (r.nodes.app?.p50 ?? 0) + (r.nodes.cache?.p50 ?? 0);
    expect(r.global.p50ByClass.default).toBeCloseTo(Math.max(viaDb, viaCache), 9);
  });

  it('FR-28: ALB + 2 × t3.micro idle cost US$ 31.61/month', () => {
    const d = diagram(
      [users, node('alb', 'aws.alb', 'alb'), node('app', 'aws.ec2', 't3.micro', { units: 2 })],
      [edge('users', 'alb'), edge('alb', 'app')],
      load(0),
    );
    expect(run(d).global.costMonth).toBeCloseTo(31.609, 3);
  });

  it('reports global error rate and throughput per class', () => {
    const d = diagram(
      [users, node('app', 'aws.ec2', 't3.micro')],
      [edge('users', 'app')],
      load(400),
    );
    const r = run(d);
    expect(r.global.errorRate).toBeCloseTo(0.5, 9);
    expect(r.global.throughputByClass.default).toBeCloseTo(200, 9);
  });

  it('gives errors back to the edge that brought the traffic', () => {
    const d = diagram(
      [users, node('app', 'aws.ec2', 't3.micro')],
      [edge('users', 'app')],
      load(400),
    );
    expect(run(d).edges['users-app']?.errorRps).toBeCloseTo(200, 9);
  });
});

describe('step: boundaries', () => {
  it('without a Users node everything is zero and a warning says so', () => {
    const d = diagram([node('app', 'aws.ec2', 't3.micro')], [], load(100));
    const r = run(d);
    expect(r.nodes.app?.rpsIn).toBe(0);
    expect(r.warnings.map((w) => w.code)).toContain('NO_ENTRY');
  });

  it('zero load leaves every node healthy', () => {
    const d = diagram([users, node('app', 'aws.ec2', 't3.micro')], [edge('users', 'app')], load(0));
    expect(run(d).nodes.app?.health).toBe('healthy');
  });

  it('marks cyclic nodes as not simulated and keeps going', () => {
    const d = diagram(
      [users, node('alb', 'aws.alb', 'alb'), node('app', 'aws.ec2', 't3.micro')],
      [edge('users', 'alb'), edge('alb', 'app'), edge('app', 'alb')],
      load(10),
    );
    const r = run(d);
    expect(r.nodes.alb?.health).toBe('unsimulated');
    expect(r.nodes.app?.rpsIn).toBe(0);
  });
});

describe('healthOf (FR-30)', () => {
  it.each([
    [0.69, 'healthy'],
    [0.7, 'pressured'],
    [0.9, 'critical'],
    [1.0, 'critical'],
    [1.01, 'bottleneck'],
  ] as const)('ρ %s → %s', (rho, health) => {
    expect(healthOf(rho)).toBe(health);
  });

  it('treats a backlog growing 3 ticks in a row as a bottleneck', () => {
    expect(healthOf(0.2, [1, 2, 3, 4])).toBe('bottleneck');
    expect(healthOf(0.2, [1, 2, 2, 4])).toBe('healthy');
    expect(healthOf(0.2, [1, 2, 3])).toBe('healthy');
  });
});

describe('determinism (NFR-9)', () => {
  it('two 100-tick runs give identical results', () => {
    const d = JSON.parse(fixtureText('diagrams/basic.json')) as ReturnType<typeof diagram>;
    expect(simulateSteady(d, catalog, { ticks: 100 })).toEqual(
      simulateSteady(d, catalog, { ticks: 100 }),
    );
  });
});

describe('provider independence (NFR-11)', () => {
  it('simulates a service of another provider from catalog data alone', () => {
    const gcp: unknown = JSON.parse(fixtureText('catalog-gcp.json'));
    const extended = parseCatalog({ ...catalog, services: [...catalog.services, gcp] });
    if (!extended.ok) throw new Error(extended.message);
    const d = diagram(
      [users, node('run', 'gcp.cloud-run', '1vcpu', { units: 2 })],
      [edge('users', 'run')],
      load(600),
    );
    const r = run(d, extended.value);
    expect(r.nodes.run?.capacity).toBe(500);
    expect(r.nodes.run?.errorRps).toBeCloseTo(100, 9);
    expect(r.nodes.run?.costMonth).toBeCloseTo(0.05 * 2 * 730, 9);
  });

  it('never names an AWS service in the engine source', () => {
    const root = fileURLToPath(new URL('.', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.ts$/.test(name) &&
          !/\.(test|bench)\.ts$/.test(name) &&
          name !== 'test-helpers.ts'
        ) {
          files.push(full);
        }
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"`]aws\./);
  });
});
