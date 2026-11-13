import { catalog } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_MONTH } from '../queueing';
import { initialState, step } from '../step';
import { ctxFor, diagram, edge, node, READ, WRITE } from '../test-helpers';
import { handlers } from './index';

describe('object storage (FR-21)', () => {
  it('1 prefix at 6,000 GET/s → 500 × 503', () => {
    const out = handlers['object-storage'].process({ read: 6000 }, ctxFor('aws.s3', 'standard'));
    expect(out.errors.read).toBeCloseTo(500, 9);
  });

  it('2 prefixes at 6,000 GET/s → no errors', () => {
    const out = handlers['object-storage'].process(
      { read: 6000 },
      ctxFor('aws.s3', 'standard', { props: { prefixes: 2 } }),
    );
    expect(out.errors.read).toBe(0);
  });

  it('counts writes as PUTs against 3,500/s per prefix', () => {
    const out = handlers['object-storage'].process({ write: 4000 }, ctxFor('aws.s3', 'standard'));
    expect(out.errors.write).toBeCloseTo(500, 9);
  });

  it('bills GETs, PUTs and transfer', () => {
    const ctx = ctxFor('aws.s3', 'standard', { classes: [{ ...READ, payloadKB: 100 }, WRITE] });
    const out = handlers['object-storage'].process({ read: 100, write: 10 }, ctx);
    const m = (rps: number) => (rps * SECONDS_PER_MONTH) / 1e6;
    const expected = 0.4 * m(100) + 5 * m(10) + 0.09 * ((100 * 100 * SECONDS_PER_MONTH) / 1e6);
    expect(out.costMonth).toBeCloseTo(expected, 6);
  });
});

describe('kv database (FR-22)', () => {
  it('provisioned 1,000 WCU with 1,500 writes/s of 1 KB → 500 throttled', () => {
    const ctx = ctxFor('aws.dynamodb', 'provisioned', { props: { wcu: 1000 } });
    const out = handlers['kv-database'].process({ write: 1500 }, ctx);
    expect(out.errors.write).toBeCloseTo(500, 9);
  });

  it('on-demand with 40% of 5,000 writes/s on one key → 1,000 throttled', () => {
    const ctx = ctxFor('aws.dynamodb', 'on-demand', { props: { hotKeyShare: 0.4 } });
    const out = handlers['kv-database'].process({ write: 5000 }, ctx);
    expect(out.errors.write).toBeCloseTo(1000, 9);
    expect(out.utilization).toBeCloseTo(2, 9);
  });

  it('reads cost half a unit per 4 KB (eventually consistent)', () => {
    const ctx = ctxFor('aws.dynamodb', 'provisioned', { props: { rcu: 500 } });
    const out = handlers['kv-database'].process({ read: 1000 }, ctx);
    expect(out.errors.read).toBe(0);
    expect(out.utilization).toBeCloseTo(1, 9);
  });

  it('bills provisioned capacity by the hour', () => {
    const ctx = ctxFor('aws.dynamodb', 'provisioned', { props: { wcu: 100, rcu: 200 } });
    const out = handlers['kv-database'].process({}, ctx);
    expect(out.costMonth).toBeCloseTo(100 * 0.00065 * 730 + 200 * 0.00013 * 730, 9);
  });

  it('bills on-demand per request unit', () => {
    const out = handlers['kv-database'].process(
      { write: 100 },
      ctxFor('aws.dynamodb', 'on-demand'),
    );
    expect(out.costMonth).toBeCloseTo(0.625 * ((100 * SECONDS_PER_MONTH) / 1e6), 6);
  });
});

describe('Aurora (FR-23)', () => {
  it('1 writer + 2 replicas: 1,500 reads per replica and 200 writes on the writer', () => {
    const ctx = ctxFor('aws.aurora-postgres', 'db.r5.large', { props: { readReplicas: 2 } });
    const out = handlers['sql-database'].process({ read: 3000, write: 200 }, ctx);
    expect(out.errors.read).toBe(0);
    expect(out.errors.write).toBe(0);
    expect(out.utilization).toBeCloseTo(1500 / 3000, 9);
    expect(out.costMonth).toBeCloseTo(3 * 0.29 * 730, 6);
  });
});

describe('API Gateway (FR-24)', () => {
  it('REST at 12,000 req/s in steady state → 2,000 × 429', () => {
    const out = handlers['api-gateway'].process(
      { read: 12_000 },
      ctxFor('aws.api-gateway', 'rest'),
    );
    expect(out.errors.read).toBeCloseTo(2000, 9);
  });

  it('WebSocket bills messages and connection minutes', () => {
    const ctx = ctxFor('aws.api-gateway', 'websocket', { props: { connections: 1000 } });
    const out = handlers['api-gateway'].process({ read: 10 }, ctx);
    const expected = 1 * ((10 * SECONDS_PER_MONTH) / 1e6) + 0.25 * ((1000 * 730 * 60) / 1e6);
    expect(out.costMonth).toBeCloseTo(expected, 6);
  });
});

describe('WAF, NAT, CloudWatch, EKS (FR-25)', () => {
  it('WAF blocking 10% of 1,000 req/s passes 900', () => {
    const out = handlers.waf.process(
      { read: 1000 },
      ctxFor('aws.waf', 'web-acl', { props: { blockedShare: 0.1 } }),
    );
    expect(out.forward.read).toBeCloseTo(900, 9);
    expect(out.errors.read).toBe(0);
  });

  it('WAF bills the ACL, the rules and every inspected request', () => {
    const out = handlers.waf.process(
      { read: 100 },
      ctxFor('aws.waf', 'web-acl', { props: { rules: 5 } }),
    );
    expect(out.costMonth).toBeCloseTo(5 + 5 + 0.6 * ((100 * SECONDS_PER_MONTH) / 1e6), 6);
  });

  it('NAT at 100 req/s of 100 KB processes 10 MB/s and bills per GB', () => {
    const ctx = ctxFor('aws.nat-gateway', 'nat', { classes: [{ ...READ, payloadKB: 100 }] });
    const out = handlers.nat.process({ read: 100 }, ctx);
    const gb = (100 * 100 * SECONDS_PER_MONTH) / 1e6;
    expect(gb / SECONDS_PER_MONTH).toBeCloseTo(0.01, 9);
    expect(out.costMonth).toBeCloseTo(0.045 * 730 + 0.045 * gb, 6);
  });

  it('CloudWatch stays off the request path and only adds cost', () => {
    const d = diagram(
      [
        node('users', 'core.users', 'default'),
        node('app', 'aws.ec2', 't3.micro'),
        node('cw', 'aws.cloudwatch', 'standard'),
      ],
      [edge('users', 'app'), edge('app', 'cw')],
    );
    const r = step(initialState(), d, catalog, 100).result;
    expect(r.nodes.cw?.rpsIn).toBe(0);
    expect(r.nodes.cw?.costMonth).toBeCloseTo(10 * 0.5 + 20 * 0.3, 9);
    expect(r.nodes.app?.rpsOut).toBe(100);
  });

  it('EKS charges the cluster fee plus nodes', () => {
    const out = handlers.compute.process(
      {},
      ctxFor('aws.eks', 'm5.large-nodes', { props: { units: 3 } }),
    );
    expect(out.costMonth).toBeCloseTo(0.1 * 730 + 3 * 0.096 * 730, 6);
  });

  it('search nodes behave as a compute pool', () => {
    const ctx = ctxFor('aws.opensearch', 'c6g.large.search', { props: { units: 2 } });
    expect(handlers.search.capacity(ctx)).toBe(800);
  });
});
