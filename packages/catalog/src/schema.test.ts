import { describe, expect, it } from 'vitest';
import { catalogJsonSchema, parseCatalog } from './schema';

const price = {
  id: 'hourly',
  label: 'Por hora',
  amountUsd: 0.0104,
  per: 'unit-hour',
  priceDate: '2026-11-13',
  sourceUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/',
};

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: 't3.micro',
    label: 't3.micro',
    capPerUnit: 200,
    capSource: 'assumption',
    baseLatencyMs: 20,
    prices: [price],
    limits: [] as unknown[],
    ...overrides,
  };
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aws.ec2',
    provider: 'aws',
    kind: 'compute',
    category: 'computacao',
    label: 'EC2',
    description: 'Máquinas virtuais',
    errorCode: '503',
    validTargetKinds: ['sql-database'],
    variants: [variant()],
    params: [{ key: 'units', label: 'Réplicas', unit: '', min: 1, max: 1000, step: 1, default: 1 }],
    ...overrides,
  };
}

function catalog(services: unknown[]) {
  return { catalogVersion: '2026-11-13.1', services };
}

describe('parseCatalog', () => {
  it('accepts a minimal valid service', () => {
    const result = parseCatalog(catalog([service()]));
    expect(result.ok).toBe(true);
  });

  it('rejects a negative price', () => {
    const s = service({ variants: [variant({ prices: [{ ...price, amountUsd: -1 }] })] });
    expect(parseCatalog(catalog([s])).ok).toBe(false);
  });

  it('rejects capPerUnit 0', () => {
    const s = service({ variants: [variant({ capPerUnit: 0 })] });
    expect(parseCatalog(catalog([s])).ok).toBe(false);
  });

  it('rejects an AWS quota without a source', () => {
    const limit = {
      id: 'concurrency',
      label: 'Concorrência',
      value: 1000,
      unit: 'execuções',
      source: 'aws-quota',
    };
    const s = service({ variants: [variant({ limits: [limit] })] });
    const result = parseCatalog(catalog([s]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('sourceUrl');
  });

  it('accepts an assumption without a source', () => {
    const limit = {
      id: 'maxConnections',
      label: 'Conexões',
      value: 100,
      unit: 'conexões',
      source: 'assumption',
    };
    const s = service({ variants: [variant({ limits: [limit] })] });
    expect(parseCatalog(catalog([s])).ok).toBe(true);
  });

  it('rejects a quota capacity without a source', () => {
    const s = service({ variants: [variant({ capSource: 'aws-quota' })] });
    expect(parseCatalog(catalog([s])).ok).toBe(false);
  });

  it('rejects a service without errorCode', () => {
    const s: Record<string, unknown> = service();
    delete s.errorCode;
    expect(parseCatalog(catalog([s])).ok).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(parseCatalog(catalog([service({ color: 'red' })])).ok).toBe(false);
  });

  it('rejects an id without provider', () => {
    expect(parseCatalog(catalog([service({ id: 'ec2' })])).ok).toBe(false);
  });

  it('rejects an id that does not start with its provider', () => {
    expect(parseCatalog(catalog([service({ id: 'gcp.ec2' })])).ok).toBe(false);
  });

  it('rejects duplicate service ids', () => {
    expect(parseCatalog(catalog([service(), service()])).ok).toBe(false);
  });

  it('rejects a param whose default is outside its range', () => {
    const s = service({
      params: [{ key: 'units', label: 'Réplicas', unit: '', min: 1, max: 10, step: 1, default: 0 }],
    });
    expect(parseCatalog(catalog([s])).ok).toBe(false);
  });

  it('rejects a non-https source', () => {
    const s = service({
      variants: [variant({ prices: [{ ...price, sourceUrl: 'http://example.com' }] })],
    });
    expect(parseCatalog(catalog([s])).ok).toBe(false);
  });

  it('exports a JSON schema', () => {
    expect(catalogJsonSchema).toHaveProperty('type', 'object');
  });
});
