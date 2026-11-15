import { catalog, findService } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import { replicaGroup } from './replicas';

const of = (serviceId: string, props: Record<string, number> = {}) =>
  replicaGroup({ props }, findService(catalog, serviceId));

describe('replicaGroup (replica-groups FR-1, FR-2, A10)', () => {
  it('counts EC2 replicas from 2 up, in the panel’s own word', () => {
    expect(of('aws.ec2', { units: 6 })).toEqual({ count: 6, label: '6 réplicas', primary: false });
    expect(of('aws.ec2', { units: 1 })).toBeNull();
    expect(of('aws.ec2')).toBeNull(); // default 1
  });

  it('reads shards, prefixes and nodes the same way, with their defaults', () => {
    expect(of('aws.kinesis', { shards: 4 })).toMatchObject({ count: 4, label: '4 shards' });
    expect(of('aws.s3', { prefixes: 3 })).toMatchObject({ count: 3, label: '3 prefixos' });
    expect(of('aws.eks')).toMatchObject({ count: 3, label: '3 nós' }); // default 3
  });

  it('shows a database as its primary plus the read replicas', () => {
    expect(of('aws.rds-postgres', { readReplicas: 2 })).toEqual({
      count: 3,
      label: 'primário + 2 réplicas de leitura',
      primary: true,
    });
    expect(of('aws.rds-postgres', { readReplicas: 1 })?.label).toBe(
      'primário + 1 réplica de leitura',
    );
    expect(of('aws.rds-postgres')).toBeNull(); // default 0
  });

  it('leaves services with nothing to count, and unknown ones, as they are', () => {
    expect(of('aws.lambda')).toBeNull();
    expect(of('aws.alb')).toBeNull();
    expect(replicaGroup({ props: {} }, undefined)).toBeNull();
  });
});
