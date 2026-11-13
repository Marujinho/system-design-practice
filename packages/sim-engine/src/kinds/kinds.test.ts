import { describe, expect, it } from 'vitest';
import { latency, monthlyCost, saturate, SECONDS_PER_MONTH } from '../queueing';
import { ctxFor } from '../test-helpers';
import { handlers } from './index';
import type { KindHandler } from './types';

function handler(kind: keyof typeof handlers): KindHandler {
  const h = handlers[kind];
  if (!h) throw new Error(`no handler ${kind}`);
  return h;
}

describe('latency (FR-16)', () => {
  it('doubles at ρ 0.5: 20 ms → 40 ms', () => {
    expect(latency(20, 0.5).p50).toBeCloseTo(40, 9);
  });

  it('is ≈ 333.3 ms at ρ 0.94', () => {
    expect(latency(20, 0.94).p50).toBeCloseTo(333.333, 2);
  });

  it('pins at 20× base from ρ 0.95 on', () => {
    expect(latency(20, 0.96).p50).toBeCloseTo(400, 9);
    expect(latency(20, 50).p50).toBeCloseTo(400, 9);
  });

  it('keeps p99 ≥ p50, finite, for every ρ', () => {
    for (const rho of [0, 0.5, 0.94, 0.96, 2, 1e6]) {
      const { p50, p99 } = latency(20, rho);
      expect(p99).toBeGreaterThanOrEqual(p50);
      expect(Number.isFinite(p99)).toBe(true);
    }
  });

  it('makes p99 grow with ρ', () => {
    expect(latency(20, 0.8).p99 / latency(20, 0.8).p50).toBeGreaterThan(
      latency(20, 0.2).p99 / latency(20, 0.2).p50,
    );
  });
});

describe('saturate', () => {
  it('cuts proportionally across classes', () => {
    const { processed, errors, rho } = saturate({ read: 300, write: 100 }, 200);
    expect(rho).toBe(2);
    expect(processed.read).toBeCloseTo(150, 9);
    expect(processed.write).toBeCloseTo(50, 9);
    expect(errors.read).toBeCloseTo(150, 9);
  });

  it('handles zero capacity without NaN', () => {
    const { processed, errors } = saturate({ read: 10 }, 0);
    expect(processed.read).toBe(0);
    expect(errors.read).toBe(10);
  });
});

describe('compute (FR-14, FR-17)', () => {
  it('EC2 t3.micro × 2 handles 400 req/s', () => {
    expect(
      handler('compute').capacity(ctxFor('aws.ec2', 't3.micro', { props: { units: 2 } })),
    ).toBe(400);
  });

  it('turns 16,666.7 req/s into 400 processed and 16,266.7 errors', () => {
    const ctx = ctxFor('aws.ec2', 't3.micro', { props: { units: 2 } });
    const out = handler('compute').process({ read: 100_000 / 6 }, ctx);
    expect(out.processed.read).toBeCloseTo(400, 6);
    expect(out.errors.read).toBeCloseTo(16_266.667, 2);
    expect(out.forward.read).toBeCloseTo(400, 6);
    expect(out.utilization).toBeCloseTo(41.6667, 3);
  });

  it('costs 2 × t3.micro = US$ 15.184/month', () => {
    const out = handler('compute').process(
      {},
      ctxFor('aws.ec2', 't3.micro', { props: { units: 2 } }),
    );
    expect(out.costMonth).toBeCloseTo(15.184, 6);
  });

  it('honours a capacity override', () => {
    const ctx = ctxFor('aws.ec2', 't3.micro', { overrides: { capPerUnit: 150 } });
    expect(handler('compute').capacity(ctx)).toBe(150);
  });

  it('reports zero latency without traffic', () => {
    const out = handler('compute').process({}, ctxFor('aws.ec2', 't3.micro'));
    expect(out.p50).toBe(0);
  });
});

describe('function (FR-14, FR-15)', () => {
  it('has 2,000 req/s capacity at 0.5 s duration', () => {
    const ctx = ctxFor('aws.lambda', 'x86', { props: { durationMs: 500 } });
    expect(handler('function').capacity(ctx)).toBeCloseTo(2000, 9);
  });

  it('returns 500 × 429 at 1,500 req/s with 1 s duration', () => {
    const ctx = ctxFor('aws.lambda', 'x86', { props: { durationMs: 1000 } });
    const out = handler('function').process({ read: 1500 }, ctx);
    expect(out.processed.read).toBeCloseTo(1000, 9);
    expect(out.errors.read).toBeCloseTo(500, 9);
  });

  it('charges US$ 52.56/month of requests at 100 req/s', () => {
    const ctx = ctxFor('aws.lambda', 'x86', { props: { durationMs: 100, memoryMB: 128 } });
    const out = handler('function').process({ read: 100 }, ctx);
    const requests = 0.2 * ((100 * SECONDS_PER_MONTH) / 1e6);
    expect(requests).toBeCloseTo(52.56, 9);
    const compute = 100 * 0.1 * 0.125 * SECONDS_PER_MONTH * 0.0000166667;
    expect(out.costMonth).toBeCloseTo(requests + compute, 6);
  });
});

describe('cdn and cache (FR-13)', () => {
  it('CloudFront 90% hit: 10,000 reads + 100 writes → 1,000 + 100 to the origin', () => {
    const ctx = ctxFor('aws.cloudfront', 'distribution', { props: { hitRatio: 0.9 } });
    const out = handler('cdn').process({ read: 10_000, write: 100 }, ctx);
    expect(out.forward.read).toBeCloseTo(1000, 9);
    expect(out.forward.write).toBeCloseTo(100, 9);
  });

  it('ElastiCache forwards only misses of cacheable reads', () => {
    const ctx = ctxFor('aws.elasticache-valkey', 'cache.t4g.micro', { props: { hitRatio: 0.8 } });
    const out = handler('cache').process({ read: 1000, write: 50 }, ctx);
    expect(out.forward.read).toBeCloseTo(200, 9);
    expect(out.forward.write).toBeCloseTo(50, 9);
  });

  it('passes everything at hit ratio 0 and nothing cacheable at 1', () => {
    const zero = ctxFor('aws.elasticache-valkey', 'cache.t4g.micro', { props: { hitRatio: 0 } });
    const one = ctxFor('aws.elasticache-valkey', 'cache.t4g.micro', { props: { hitRatio: 1 } });
    expect(handler('cache').process({ read: 10 }, zero).forward.read).toBe(10);
    expect(handler('cache').process({ read: 10 }, one).forward.read).toBe(0);
  });
});

describe('load balancer', () => {
  it('costs US$ 16.425/month idle', () => {
    expect(handler('load-balancer').process({}, ctxFor('aws.alb', 'alb')).costMonth).toBeCloseTo(
      16.425,
      6,
    );
  });

  it('adds LCU cost with traffic', () => {
    const busy = handler('load-balancer').process({ read: 1000 }, ctxFor('aws.alb', 'alb'));
    expect(busy.costMonth).toBeGreaterThan(16.425);
  });
});

describe('sql database (FR-23 basis)', () => {
  it('saturates a single writer', () => {
    const out = handler('sql-database').process(
      { read: 400 },
      ctxFor('aws.rds-postgres', 'db.t4g.micro'),
    );
    expect(out.processed.read).toBeCloseTo(300, 9);
    expect(out.errors.read).toBeCloseTo(100, 9);
  });

  it('splits reads across replicas and keeps writes on the writer', () => {
    const ctx = ctxFor('aws.rds-postgres', 'db.m7g.large', { props: { readReplicas: 2 } });
    const out = handler('sql-database').process({ read: 3000, write: 200 }, ctx);
    expect(out.errors.read).toBe(0);
    expect(out.utilization).toBeCloseTo(0.5, 9);
    expect(out.costMonth).toBeCloseTo(3 * 0.168 * 730, 6);
  });
});

describe('dns and entry', () => {
  it('Route 53 charges the zone and only the query share', () => {
    const out = handler('dns').process({ read: 1000 }, ctxFor('aws.route53', 'hosted-zone'));
    const expected = 0.5 + 0.4 * ((1000 * 0.01 * SECONDS_PER_MONTH) / 1e6);
    expect(out.costMonth).toBeCloseTo(expected, 6);
    expect(out.forward.read).toBe(1000);
  });

  it('the entry node passes the load through at zero cost', () => {
    const out = handler('entry').process({ read: 5 }, ctxFor('core.users', 'default'));
    expect(out.forward.read).toBe(5);
    expect(out.costMonth).toBe(0);
  });
});

describe('monthlyCost', () => {
  it('lets a price id override its dimension', () => {
    const prices = ctxFor('aws.lambda', 'x86').variant.prices;
    expect(monthlyCost(prices, {}, { requests: 2 })).toBeCloseTo(0.4, 9);
  });
});
