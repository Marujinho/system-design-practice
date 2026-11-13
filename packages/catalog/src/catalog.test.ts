import { describe, expect, it } from 'vitest';
import data from './catalog.json' with { type: 'json' };
import before from './fixtures/variants-2026-11-13.1.json' with { type: 'json' };
import { catalog, findService, findVariant, parseCatalog, type Variant } from './index';

function variantOf(serviceId: string, variantId: string) {
  const service = findService(catalog, serviceId);
  if (!service) throw new Error(`missing ${serviceId}`);
  const variant = findVariant(service, variantId);
  if (!variant) throw new Error(`missing ${variantId}`);
  return variant;
}

function priceOf(serviceId: string, variantId: string, priceId: string): number {
  const p = variantOf(serviceId, variantId).prices.find((x) => x.id === priceId);
  if (!p) throw new Error(`missing price ${priceId}`);
  return p.amountUsd;
}

describe('catalog.json', () => {
  it('passes the schema', () => {
    expect(parseCatalog(data).ok).toBe(true);
  });

  it('has 23 entries: Users + 22 AWS services', () => {
    expect(catalog.services).toHaveLength(23);
    expect(catalog.services.filter((s) => s.provider === 'aws')).toHaveLength(22);
  });

  it('has the 8 base services', () => {
    expect(catalog.services.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'core.users',
        'aws.route53',
        'aws.cloudfront',
        'aws.alb',
        'aws.ec2',
        'aws.lambda',
        'aws.rds-postgres',
        'aws.elasticache-valkey',
      ]),
    );
  });

  it('prices t3.micro at US$ 0.0104/h → US$ 7.592/month (730 h)', () => {
    const hourly = priceOf('aws.ec2', 't3.micro', 'hourly');
    expect(hourly).toBe(0.0104);
    expect(hourly * 730).toBeCloseTo(7.592, 6);
  });

  it('prices the ALB at US$ 0.0225/h → US$ 16.425/month', () => {
    expect(priceOf('aws.alb', 'alb', 'hourly') * 730).toBeCloseTo(16.425, 6);
  });

  it('prices Lambda at US$ 0.20/million and US$ 0.0000166667/GB-s', () => {
    expect(priceOf('aws.lambda', 'x86', 'requests')).toBe(0.2);
    expect(priceOf('aws.lambda', 'x86', 'compute')).toBe(0.0000166667);
  });

  it('uses the source-document req/s premises for EC2', () => {
    expect(variantOf('aws.ec2', 't3.nano').capPerUnit).toBe(100);
    expect(variantOf('aws.ec2', 't3.micro').capPerUnit).toBe(200);
    expect(variantOf('aws.ec2', 't3.small').capPerUnit).toBe(300);
    expect(variantOf('aws.ec2', 't3.medium').capPerUnit).toBe(500);
    expect(variantOf('aws.ec2', 'm5.large').capPerUnit).toBe(800);
    expect(variantOf('aws.ec2', 't3.micro').capSource).toBe('assumption');
  });

  it('marks T instances as burstable and m5 as not', () => {
    expect(variantOf('aws.ec2', 't3.micro').burst).toBe(true);
    expect(variantOf('aws.ec2', 'm5.large').burst).toBe(false);
  });

  it('treats Lambda concurrency (1,000) as a cited AWS quota', () => {
    const v = variantOf('aws.lambda', 'x86');
    expect(v.capPerUnit).toBe(1000);
    expect(v.capSource).toBe('aws-quota');
    expect(v.capSourceUrl).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
  });

  it('cites a source for every quota and every price, dated', () => {
    for (const s of catalog.services) {
      for (const v of s.variants) {
        for (const l of v.limits) {
          if (l.source === 'aws-quota') expect(l.sourceUrl, `${s.id}/${l.id}`).toBeDefined();
        }
        for (const p of v.prices) {
          expect(p.priceDate).toBe('2026-11-13');
          expect(p.sourceUrl).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it('keeps the source-document numbers for the other services', () => {
    expect(priceOf('aws.sqs', 'standard', 'requests')).toBe(0.4);
    expect(priceOf('aws.sqs', 'fifo', 'requests')).toBe(0.5);
    expect(priceOf('aws.kinesis', 'provisioned', 'shardHours')).toBe(0.015);
    expect(priceOf('aws.api-gateway', 'rest', 'requests')).toBe(3.5);
    expect(priceOf('aws.api-gateway', 'http', 'requests')).toBe(1);
    expect(priceOf('aws.nat-gateway', 'nat', 'hourly')).toBe(0.045);
    expect(priceOf('aws.dynamodb', 'on-demand', 'writeRequests')).toBe(0.625);
    expect(priceOf('aws.dynamodb', 'on-demand', 'readRequests')).toBe(0.125);
    expect(priceOf('aws.aurora-postgres', 'db.r5.large', 'hourly')).toBe(0.29);
  });

  it('enforces the documented quotas', () => {
    const limit = (s: string, v: string, id: string) =>
      variantOf(s, v).limits.find((l) => l.id === id);
    expect(limit('aws.s3', 'standard', 'putPerPrefix')?.value).toBe(3500);
    expect(limit('aws.s3', 'standard', 'getPerPrefix')?.value).toBe(5500);
    expect(limit('aws.dynamodb', 'on-demand', 'partitionRcu')?.value).toBe(3000);
    expect(limit('aws.dynamodb', 'on-demand', 'partitionWcu')?.value).toBe(1000);
    expect(limit('aws.api-gateway', 'rest', 'accountRps')?.value).toBe(10000);
    expect(limit('aws.api-gateway', 'rest', 'burst')?.value).toBe(5000);
    expect(limit('aws.kinesis', 'provisioned', 'writeRecordsPerShard')?.value).toBe(1000);
    expect(limit('aws.sqs', 'fifo', 'callsPerSecond')?.value).toBe(300);
    for (const [s, v, id] of [
      ['aws.s3', 'standard', 'putPerPrefix'],
      ['aws.dynamodb', 'provisioned', 'partitionWcu'],
      ['aws.kinesis', 'provisioned', 'writeMBPerShard'],
    ] as const) {
      expect(limit(s, v, id)?.source).toBe('aws-quota');
    }
  });

  it('marks numbers without an official page as assumptions', () => {
    const ws = variantOf('aws.api-gateway', 'websocket').limits.find(
      (l) => l.id === 'newConnectionsPerSecond',
    );
    expect(ws?.source).toBe('assumption');
    expect(variantOf('aws.sns', 'standard').capSource).toBe('assumption');
  });
});

describe('existing variants (aws-instance-types FR-10)', () => {
  // The catalog as of 2026-11-13.1: saved diagrams, references and scores depend on these numbers.
  const snapshot = before as Record<string, Record<string, unknown>[]>;

  it('keeps every variant that existed, number for number', () => {
    for (const [serviceId, variants] of Object.entries(snapshot)) {
      const service = findService(catalog, serviceId);
      expect(service, serviceId).toBeDefined();
      for (const old of variants) {
        const now = service ? findVariant(service, String(old.id)) : undefined;
        expect(now, `${serviceId}/${String(old.id)}`).toBeDefined();
        const { family: _family, ...rest } = now ?? {};
        expect(rest, `${serviceId}/${String(old.id)}`).toEqual(old);
      }
    }
  });

  it('keeps the default type of a new node', () => {
    for (const [serviceId, variants] of Object.entries(snapshot)) {
      expect(findService(catalog, serviceId)?.variants[0]?.id, serviceId).toBe(variants[0]?.id);
    }
  });
});

// The simulated capacity of each instance type (req/s per unit) is a premise, written once here
// as a rule per service and anchored on the numbers the catalog already had (aws-instance-types FR-9).
const SNAPSHOT_IDS = new Set(
  Object.entries(before as Record<string, { id: string }[]>).flatMap(([s, vs]) =>
    vs.map((v) => `${s}/${v.id}`),
  ),
);

function vcpusOf(label: string): number {
  const m = /([\d.,]+) vCPU/.exec(label);
  if (!m?.[1]) throw new Error(`sem vCPU no rótulo: ${label}`);
  return Number(m[1].replace(',', '.'));
}

function gibOf(label: string): number {
  const m = /([\d.,]+) GiB/.exec(label);
  if (!m?.[1]) throw new Error(`sem GiB no rótulo: ${label}`);
  return Number(m[1].replace(',', '.'));
}

/** The AWS instance family of a type, without its size: db.r7g.xlarge → db.r7g, c5.large-nodes → c5. */
function generationOf(id: string): string {
  const bare = id.replace(/-nodes$/, '').replace(/\.search$/, '');
  return bare.includes('.') ? bare.slice(0, bare.lastIndexOf('.')) : 'all';
}

const EC2_PER_VCPU = { burst: 300, general: 400, compute: 500, memory: 400 } as const;

function capacityRule(serviceId: string, v: Variant): number {
  const cpu = vcpusOf(v.label);
  switch (serviceId) {
    case 'aws.ec2':
    case 'aws.eks':
      if (v.id.startsWith('t3.medium')) return 500;
      return EC2_PER_VCPU[v.family ?? 'general'] * cpu;
    case 'aws.rds-postgres':
    case 'aws.aurora-postgres':
      return v.family === 'burst' ? 300 * gibOf(v.label) : 1500 * cpu;
    default:
      throw new Error(`sem regra para ${serviceId}`);
  }
}

function newVariants(serviceId: string): Variant[] {
  return (findService(catalog, serviceId)?.variants ?? []).filter(
    (v) => !SNAPSHOT_IDS.has(`${serviceId}/${v.id}`),
  );
}

function hourlyOf(v: Variant): number {
  return v.prices.find((p) => p.id === 'hourly')?.amountUsd ?? 0;
}

const ids = (serviceId: string) => findService(catalog, serviceId)?.variants.map((v) => v.id);

describe('instance types (aws-instance-types)', () => {
  it.each(['aws.ec2', 'aws.eks', 'aws.rds-postgres', 'aws.aurora-postgres'])(
    '%s: every new type follows the capacity rule',
    (serviceId) => {
      const added = newVariants(serviceId);
      expect(added.length).toBeGreaterThan(0);
      for (const v of added) {
        expect(v.capPerUnit, `${serviceId}/${v.id}`).toBe(capacityRule(serviceId, v));
        expect(v.capSource).toBe('assumption');
        expect(v.family, `${serviceId}/${v.id}`).toBeDefined();
      }
    },
  );

  it.each(['aws.ec2', 'aws.eks', 'aws.rds-postgres', 'aws.aurora-postgres'])(
    '%s: capacity grows with size within an instance family',
    (serviceId) => {
      const variants = findService(catalog, serviceId)?.variants ?? [];
      for (const family of new Set(variants.map((v) => generationOf(v.id)))) {
        const sorted = variants
          .filter((v) => generationOf(v.id) === family)
          .sort((a, b) => hourlyOf(a) - hourlyOf(b));
        for (let i = 1; i < sorted.length; i += 1) {
          expect(sorted[i]?.capPerUnit, `${serviceId}/${family}`).toBeGreaterThan(
            sorted[i - 1]?.capPerUnit ?? 0,
          );
        }
      }
    },
  );

  it('EC2: compute beats general, which matches memory, and c5.xlarge is 10 × t3.micro', () => {
    const cap = (id: string) => variantOf('aws.ec2', id).capPerUnit;
    expect(cap('c5.xlarge')).toBeGreaterThan(cap('m5.xlarge'));
    expect(cap('m5.xlarge')).toBeGreaterThanOrEqual(cap('r5.xlarge'));
    expect(cap('c5.xlarge')).toBe(10 * cap('t3.micro'));
  });

  it('EC2: the 19 types, T family burstable', () => {
    expect(ids('aws.ec2')).toEqual([
      't3.nano',
      't3.micro',
      't3.small',
      't3.medium',
      'm5.large',
      't3.large',
      't3.xlarge',
      't3.2xlarge',
      'm5.xlarge',
      'm5.2xlarge',
      'm5.4xlarge',
      'c5.large',
      'c5.xlarge',
      'c5.2xlarge',
      'c5.4xlarge',
      'r5.large',
      'r5.xlarge',
      'r5.2xlarge',
      'r5.4xlarge',
    ]);
    for (const v of findService(catalog, 'aws.ec2')?.variants ?? []) {
      expect(v.burst, v.id).toBe(v.id.startsWith('t3.'));
    }
  });

  it('EC2: prices as published for us-east-1 Linux on-demand', () => {
    expect(priceOf('aws.ec2', 't3.2xlarge', 'hourly')).toBe(0.3328);
    expect(priceOf('aws.ec2', 'm5.4xlarge', 'hourly')).toBe(0.768);
    expect(priceOf('aws.ec2', 'c5.xlarge', 'hourly')).toBe(0.17);
    expect(priceOf('aws.ec2', 'r5.4xlarge', 'hourly')).toBe(1.008);
  });

  it('EKS: the 9 node types, each with the cluster fee and its EC2 hourly price', () => {
    expect(ids('aws.eks')).toEqual([
      'm5.large-nodes',
      't3.medium-nodes',
      't3.large-nodes',
      'm5.xlarge-nodes',
      'm5.2xlarge-nodes',
      'c5.large-nodes',
      'c5.xlarge-nodes',
      'r5.large-nodes',
      'r5.xlarge-nodes',
    ]);
    for (const v of findService(catalog, 'aws.eks')?.variants ?? []) {
      const ec2 = v.id.replace(/-nodes$/, '');
      expect(priceOf('aws.eks', v.id, 'clusterFee'), v.id).toBe(0.1);
      expect(priceOf('aws.eks', v.id, 'hourly'), v.id).toBe(priceOf('aws.ec2', ec2, 'hourly'));
      expect(v.capPerUnit, v.id).toBe(variantOf('aws.ec2', ec2).capPerUnit);
    }
  });

  it.each(['aws.ec2', 'aws.eks'])(
    '%s: new labels name the type, its vCPUs and its memory',
    (serviceId) => {
      for (const v of newVariants(serviceId)) {
        const type = v.id.replace(/-nodes$/, '');
        expect(v.label, v.id).toContain(type);
        expect(v.label, v.id).toMatch(/\d+ vCPU, [\d.,]+ GiB/);
      }
      for (const id of ['aws.ec2', 'aws.rds-postgres', 'aws.aurora-postgres'])
        for (const v of newVariants(id)) expect(v.label.startsWith(v.id), v.id).toBe(true);
    },
  );

  it('RDS PostgreSQL: the 12 types, t4g burstable, Single-AZ prices', () => {
    expect(ids('aws.rds-postgres')).toEqual([
      'db.t4g.micro',
      'db.t4g.small',
      'db.m7g.large',
      'db.t4g.medium',
      'db.t4g.large',
      'db.m7g.xlarge',
      'db.m7g.2xlarge',
      'db.m7g.4xlarge',
      'db.r7g.large',
      'db.r7g.xlarge',
      'db.r7g.2xlarge',
      'db.r7g.4xlarge',
    ]);
    for (const v of findService(catalog, 'aws.rds-postgres')?.variants ?? []) {
      expect(v.burst, v.id).toBe(v.id.startsWith('db.t4g.'));
    }
    expect(priceOf('aws.rds-postgres', 'db.t4g.large', 'hourly')).toBe(0.129);
    expect(priceOf('aws.rds-postgres', 'db.m7g.4xlarge', 'hourly')).toBe(1.348);
    expect(priceOf('aws.rds-postgres', 'db.r7g.xlarge', 'hourly')).toBe(0.478);
  });

  it('Aurora PostgreSQL: the 9 types, Standard storage prices', () => {
    expect(ids('aws.aurora-postgres')).toEqual([
      'db.r5.large',
      'db.t4g.medium',
      'db.r5.xlarge',
      'db.r5.2xlarge',
      'db.r5.4xlarge',
      'db.r7g.large',
      'db.r7g.xlarge',
      'db.r7g.2xlarge',
      'db.r7g.4xlarge',
    ]);
    expect(variantOf('aws.aurora-postgres', 'db.t4g.medium').burst).toBe(true);
    expect(priceOf('aws.aurora-postgres', 'db.t4g.medium', 'hourly')).toBe(0.073);
    expect(priceOf('aws.aurora-postgres', 'db.r5.4xlarge', 'hourly')).toBe(2.32);
    expect(priceOf('aws.aurora-postgres', 'db.r7g.large', 'hourly')).toBe(0.276);
  });
});
