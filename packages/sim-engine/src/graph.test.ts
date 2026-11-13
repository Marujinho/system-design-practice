import { describe, expect, it } from 'vitest';
import { analyze, distribute } from './graph';
import { diagram, edge, node } from './test-helpers';

const ec2 = (id: string) => node(id, 'aws.ec2', 't3.micro');

describe('distribute', () => {
  it('splits by weight: 80/20 of 1,000 → 800/200', () => {
    const edges = [edge('app', 'cache', { weight: 0.8 }), edge('app', 'db', { weight: 0.2 })];
    const { perEdge, warnings } = distribute('app', { default: 1000 }, edges);
    expect(perEdge.get('app-cache')?.default).toBeCloseTo(800, 9);
    expect(perEdge.get('app-db')?.default).toBeCloseTo(200, 9);
    expect(warnings).toEqual([]);
  });

  it('normalizes 60/60 to 50/50 with a warning', () => {
    const edges = [edge('a', 'b', { weight: 0.6 }), edge('a', 'c', { weight: 0.6 })];
    const { perEdge, warnings } = distribute('a', { default: 100 }, edges);
    expect(perEdge.get('a-b')?.default).toBeCloseTo(50, 9);
    expect(perEdge.get('a-c')?.default).toBeCloseTo(50, 9);
    expect(warnings.map((w) => w.code)).toEqual(['WEIGHTS_NORMALIZED']);
  });

  it('gives each of 3 unweighted edges a third', () => {
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('a', 'd')];
    const { perEdge, warnings } = distribute('a', { default: 90 }, edges);
    for (const id of ['a-b', 'a-c', 'a-d']) expect(perEdge.get(id)?.default).toBeCloseTo(30, 9);
    expect(warnings).toEqual([]);
  });

  it('lets unweighted edges share what the weights leave', () => {
    const edges = [edge('a', 'b', { weight: 0.5 }), edge('a', 'c'), edge('a', 'd')];
    const { perEdge } = distribute('a', { default: 100 }, edges);
    expect(perEdge.get('a-b')?.default).toBeCloseTo(50, 9);
    expect(perEdge.get('a-c')?.default).toBeCloseTo(25, 9);
    expect(perEdge.get('a-d')?.default).toBeCloseTo(25, 9);
  });

  it('routes reads only to the cache and writes only to the database', () => {
    const edges = [
      edge('app', 'cache', { classes: ['read'] }),
      edge('app', 'db', { classes: ['write'] }),
    ];
    const { perEdge } = distribute('app', { read: 1000, write: 100 }, edges);
    expect(perEdge.get('app-cache')).toEqual({ read: 1000 });
    expect(perEdge.get('app-db')).toEqual({ write: 100 });
  });

  it('drops a class no edge accepts (the node is its sink)', () => {
    const { perEdge } = distribute('app', { read: 10 }, [
      edge('app', 'db', { classes: ['write'] }),
    ]);
    expect(perEdge.get('app-db')).toEqual({});
  });

  it('splits equally with a warning when every weight is zero', () => {
    const edges = [edge('a', 'b', { weight: 0 }), edge('a', 'c', { weight: 0 })];
    const { perEdge, warnings } = distribute('a', { default: 10 }, edges);
    expect(perEdge.get('a-b')?.default).toBeCloseTo(5, 9);
    expect(warnings).toHaveLength(1);
  });

  it('returns nothing for a node without edges', () => {
    expect(distribute('a', { default: 10 }, []).perEdge.size).toBe(0);
  });
});

describe('analyze', () => {
  it('orders a chain topologically', () => {
    const d = diagram(
      [node('users', 'core.users', 'default'), ec2('alb'), ec2('app')],
      [edge('users', 'alb'), edge('alb', 'app')],
    );
    const a = analyze(d, 'users');
    expect(a.order).toEqual(['users', 'alb', 'app']);
    expect(a.cyclic.size).toBe(0);
    expect(a.depth.get('app')).toBe(2);
  });

  it('detects ALB → EC2 → ALB and keeps the rest', () => {
    const d = diagram(
      [node('users', 'core.users', 'default'), ec2('alb'), ec2('app'), ec2('other')],
      [edge('users', 'alb'), edge('alb', 'app'), edge('app', 'alb'), edge('users', 'other')],
    );
    const a = analyze(d, 'users');
    expect([...a.cyclic].sort()).toEqual(['alb', 'app']);
    expect(a.order).toEqual(['users', 'other']);
    expect(a.warnings.map((w) => w.code)).toEqual(['CYCLE_UNSUPPORTED', 'CYCLE_UNSUPPORTED']);
  });

  it('detects a cycle with a queue in the middle', () => {
    const d = diagram(
      [node('fn', 'aws.lambda', 'x86'), node('q', 'aws.ec2', 't3.micro')],
      [edge('fn', 'q'), edge('q', 'fn')],
    );
    expect(analyze(d, undefined).cyclic.size).toBe(2);
  });

  it('detects a self-loop', () => {
    const d = diagram([ec2('a')], [edge('a', 'a')]);
    expect([...analyze(d, undefined).cyclic]).toEqual(['a']);
  });

  it('handles an isolated node and a disconnected graph', () => {
    const d = diagram(
      [node('users', 'core.users', 'default'), ec2('a'), ec2('b'), ec2('c')],
      [edge('users', 'a'), edge('b', 'c')],
    );
    const a = analyze(d, 'users');
    expect(a.order).toHaveLength(4);
    expect(a.depth.get('b')).toBe(Number.POSITIVE_INFINITY);
  });

  it('finishes a 200-node ring in under 100 ms', () => {
    const nodes = Array.from({ length: 200 }, (_, i) => ec2(`n${i}`));
    const edges = nodes.map((n, i) => edge(n.id, `n${(i + 1) % 200}`));
    const start = performance.now();
    const a = analyze(diagram(nodes, edges), undefined);
    expect(performance.now() - start).toBeLessThan(100);
    expect(a.cyclic.size).toBe(200);
  });

  it('keeps out-of-band nodes off the traffic path', () => {
    const d = diagram([ec2('a'), ec2('logs')], [edge('a', 'logs')]);
    const a = analyze(d, undefined, (id) => id !== 'logs');
    expect(a.order).toEqual(['a']);
    expect(a.outEdges.get('a')).toEqual([]);
  });
});
