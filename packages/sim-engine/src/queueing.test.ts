import type { Price } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import { monthlyCost, requestsMillionsPerMonth, tieredCost } from './queueing';

const base = { priceDate: '2026-11-15', sourceUrl: 'https://aws.amazon.com/api-gateway/pricing/' };
/** API Gateway REST, us-east-1 (AWS Price List API, 2026-11-15). */
const rest: Price = {
  id: 'requests',
  label: 'Requisições',
  amountUsd: 3.5,
  per: 'million-requests',
  tiers: [
    { upTo: 333, amountUsd: 3.5 },
    { upTo: 1000, amountUsd: 2.8 },
    { upTo: 20000, amountUsd: 2.38 },
    { upTo: null, amountUsd: 1.51 },
  ],
  ...base,
};

describe('tiered prices (cost-model FR-1, A10)', () => {
  it('charges each tier on the volume that falls in it: REST at 10k req/s', () => {
    const millions = requestsMillionsPerMonth(10_000); // 26,280
    const expected = 333 * 3.5 + 667 * 2.8 + 19_000 * 2.38 + (millions - 20_000) * 1.51;
    expect(tieredCost(millions, rest)).toBeCloseTo(expected, 6);
    expect(tieredCost(millions, rest)).toBeCloseTo(57_736, -1);
  });

  it('is the flat price inside the first tier, and zero for no volume', () => {
    expect(tieredCost(100, rest)).toBeCloseTo(350, 9);
    expect(tieredCost(0, rest)).toBe(0);
    expect(tieredCost(-5, rest)).toBe(0);
  });

  it('passes NaN through, as a flat price does, so the step can flag it', () => {
    expect(tieredCost(Number.NaN, rest)).toBeNaN();
  });

  it('crosses a boundary exactly', () => {
    expect(tieredCost(333, rest)).toBeCloseTo(333 * 3.5, 9);
    expect(tieredCost(1000, rest)).toBeCloseTo(333 * 3.5 + 667 * 2.8, 9);
  });

  it('keeps flat prices flat, through monthlyCost too', () => {
    const flat: Price = { id: 'hourly', label: 'Hora', amountUsd: 0.1, per: 'unit-hour', ...base };
    expect(monthlyCost([flat, rest], { 'unit-hour': 730, 'million-requests': 100 })).toBeCloseTo(
      73 + 350,
      9,
    );
  });
});
