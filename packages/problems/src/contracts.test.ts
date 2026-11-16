import { describe, expect, it } from 'vitest';
import { FindingSchema } from './contracts';

const finding = {
  type: 'bottleneck',
  nodeIds: ['app'],
  message: 'EC2 (app) recebe 10 req/s.',
  numbers: { rpsIn: 10 },
  impact: 1,
};

describe('FindingSchema (language-switch FR-8, FR-13)', () => {
  it('accepts a finding saved before the English sentence existed', () => {
    expect(FindingSchema.safeParse(finding).success).toBe(true);
  });

  it('accepts the English sentence, and only as text', () => {
    expect(
      FindingSchema.safeParse({ ...finding, messageEn: 'EC2 (app) receives 10 req/s.' }).success,
    ).toBe(true);
    expect(FindingSchema.safeParse({ ...finding, messageEn: 3 }).success).toBe(false);
  });
});
