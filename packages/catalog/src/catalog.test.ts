import { describe, expect, it } from 'vitest';
import data from './catalog.json';
import { catalog, findService, findVariant, parseCatalog } from './index';

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
});
