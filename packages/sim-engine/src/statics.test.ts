import { catalog } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import { nodeStatics } from './statics';
import { diagram, node } from './test-helpers';

const load = diagram([], []).load;

describe('nodeStatics', () => {
  it('EC2 t3.small × 3 → 900 req/s and US$ 45.55/month (FR-7)', () => {
    const s = nodeStatics(node('a', 'aws.ec2', 't3.small', { units: 3 }), catalog, load);
    expect(s?.capacity).toBe(900);
    expect(s?.idleCostMonth).toBeCloseTo(45.552, 3);
  });

  it('Kinesis with 4 shards → 4,000 records/s', () => {
    expect(
      nodeStatics(node('k', 'aws.kinesis', 'provisioned', { shards: 4 }), catalog, load)?.capacity,
    ).toBe(4000);
  });

  it('reports infinite capacity for the entry', () => {
    expect(nodeStatics(node('u', 'core.users', 'default'), catalog, load)?.capacity).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('returns null for an unknown service', () => {
    expect(nodeStatics(node('x', 'aws.nope', 'v'), catalog, load)).toBeNull();
  });
});
