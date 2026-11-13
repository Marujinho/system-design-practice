import type { Diagram, DiagramEdge, DiagramNode } from '../src/diagram';

/** 50 nodes, 60 edges, 1M req/min: the NFR-1/NFR-2 reference graph. */
export function perfDiagram(): Diagram {
  const nodes: DiagramNode[] = [
    {
      id: 'users',
      serviceId: 'core.users',
      variantId: 'default',
      position: { x: 0, y: 0 },
      label: 'Usuários',
      props: {},
      overrides: {},
    },
  ];
  const kinds: [string, string, Record<string, number>][] = [
    ['aws.alb', 'alb', {}],
    ['aws.ec2', 'm5.large', { units: 4 }],
    ['aws.elasticache-valkey', 'cache.t4g.micro', { units: 2 }],
    ['aws.rds-postgres', 'db.m7g.large', { readReplicas: 2 }],
    ['aws.lambda', 'x86', { durationMs: 50 }],
  ];
  for (let i = 1; i < 50; i += 1) {
    const [serviceId, variantId, props] = kinds[i % kinds.length] ??
      kinds[0] ?? ['aws.ec2', 'm5.large', {}];
    nodes.push({
      id: `n${i}`,
      serviceId,
      variantId,
      position: { x: i * 50, y: 0 },
      label: `n${i}`,
      props,
      overrides: {},
    });
  }
  const edges: DiagramEdge[] = [];
  for (let i = 1; i < 50; i += 1) {
    const source = i <= 5 ? 'users' : `n${Math.floor(i / 2)}`;
    edges.push({ id: `e${i}`, source, target: `n${i}`, protocol: 'http' });
  }
  for (let i = 0; edges.length < 60; i += 1) {
    const a = 6 + i;
    const b = 30 + i;
    edges.push({ id: `x${i}`, source: `n${a}`, target: `n${b}`, protocol: 'http' });
  }
  return {
    schemaVersion: 1,
    catalogVersion: '2026-11-13.1',
    nodes,
    edges,
    load: {
      classes: [
        {
          name: 'read',
          label: 'Leitura',
          mode: 'rpm',
          op: 'read',
          rpm: 900_000,
          payloadKB: 2,
          cacheable: true,
        },
        {
          name: 'write',
          label: 'Escrita',
          mode: 'rpm',
          op: 'write',
          rpm: 100_000,
          payloadKB: 1,
          cacheable: false,
        },
      ],
    },
  };
}
