import { catalog } from '@archsim/catalog';
import type { ProposalOp } from '@archsim/problems';
import { loadProblem, PROBLEMS_DIR } from '@archsim/problems/load';
import type { Diagram } from '@archsim/sim-engine';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyProposal, describeOp, proposalNodeId } from './proposal';

const reference: Diagram = (() => {
  const r = loadProblem(join(PROBLEMS_DIR, 'url-shortener'), catalog);
  if (!r.ok) throw new Error(r.message);
  return r.value.reference;
})();
// users → alb → app → cache → db, and app → db

let seq = 0;
const options = {
  catalog,
  newId: (s: string, i: number) => `${s.split('.')[1] ?? 'x'}-t${String(i)}-${String((seq += 1))}`,
};
const apply = (ops: ProposalOp[], d: Diagram = reference) => applyProposal(d, ops, options);
const node = (d: Diagram, id: string) => d.nodes.find((n) => n.id === id);

describe('applyProposal (mentor-edits FR-2, FR-6, FR-7, FR-10)', () => {
  it('adds a service with type, props and name, and connects it', () => {
    const r = apply([
      { op: 'add', ref: 'novo1', service: 'aws.sqs', label: 'Fila de criação' },
      { op: 'connect', from: 'app', to: 'novo1' },
    ]);
    if (!r.ok) throw new Error(r.message);
    const added = r.diagram.nodes.find((n) => n.label === 'Fila de criação');
    expect(added?.serviceId).toBe('aws.sqs');
    expect(r.diagram.edges.some((e) => e.source === 'app' && e.target === added?.id)).toBe(true);
    expect(r.diagram.edges.find((e) => e.target === added?.id)?.protocol).toBe('queue');
  });

  it('changes replicas, type and name, removes a node with its edges, disconnects', () => {
    const r = apply([
      { op: 'set_prop', node: 'app', key: 'units', value: 6 },
      {
        op: 'set_variant',
        node: 'db',
        variant: reference.nodes.find((n) => n.id === 'db')?.variantId ?? '',
      },
      { op: 'rename', node: 'app', label: 'Redirecionador' },
      { op: 'remove', node: 'cache' },
      { op: 'disconnect', from: 'alb', to: 'app' },
    ]);
    if (!r.ok) throw new Error(r.message);
    expect(node(r.diagram, 'app')?.props.units).toBe(6);
    expect(node(r.diagram, 'app')?.label).toBe('Redirecionador');
    expect(node(r.diagram, 'cache')).toBeUndefined();
    expect(r.diagram.edges.some((e) => e.source === 'cache' || e.target === 'cache')).toBe(false);
    expect(r.diagram.edges.some((e) => e.source === 'alb' && e.target === 'app')).toBe(false);
    expect(r.diagram.load).toEqual(reference.load);
  });

  it('is all or nothing: one bad operation leaves the diagram untouched', () => {
    const r = apply([
      { op: 'set_prop', node: 'app', key: 'units', value: 6 },
      { op: 'rename', node: 'app', label: 'X' },
      { op: 'set_prop', node: 'app', key: 'units', value: 1_000_000 },
      { op: 'remove', node: 'cache' },
    ]);
    expect(r).toMatchObject({ ok: false, code: 'invalid' });
    expect(node(reference, 'app')?.props.units).toBe(30);
    expect(node(reference, 'cache')).toBeDefined();
  });

  it('calls a proposal on a node that is gone stale (missing)', () => {
    const r = apply([{ op: 'set_prop', node: 'ghost', key: 'units', value: 2 }]);
    expect(r).toMatchObject({ ok: false, code: 'missing' });
    expect(apply([{ op: 'disconnect', from: 'users', to: 'db' }])).toMatchObject({
      ok: false,
      code: 'missing',
    });
  });

  it('protects the Users node and refuses unknown services, types and params', () => {
    expect(apply([{ op: 'remove', node: 'users' }])).toMatchObject({ ok: false, code: 'invalid' });
    expect(apply([{ op: 'rename', node: 'users', label: 'X' }])).toMatchObject({ ok: false });
    expect(apply([{ op: 'add', ref: 'novo1', service: 'core.users' }])).toMatchObject({
      ok: false,
    });
    expect(apply([{ op: 'add', ref: 'novo1', service: 'aws.nope' }])).toMatchObject({ ok: false });
    expect(apply([{ op: 'set_variant', node: 'app', variant: 'z9.huge' }])).toMatchObject({
      ok: false,
    });
    expect(apply([{ op: 'set_prop', node: 'app', key: 'banana', value: 1 }])).toMatchObject({
      ok: false,
    });
    expect(apply([{ op: 'connect', from: 'app', to: 'app' }])).toMatchObject({ ok: false });
    expect(apply([{ op: 'connect', from: 'users', to: 'alb' }])).toMatchObject({ ok: false });
  });

  it('refuses a connection into Users, which the canvas can’t draw (review M4)', () => {
    expect(apply([{ op: 'connect', from: 'app', to: 'users' }])).toMatchObject({
      ok: false,
      code: 'invalid',
    });
  });

  it('names new edges with the id maker, never from node ids (review L3)', () => {
    const r = apply([{ op: 'connect', from: 'alb', to: 'db' }]);
    if (!r.ok) throw new Error(r.message);
    const added = r.diagram.edges.find((e) => e.source === 'alb' && e.target === 'db');
    expect(added?.id).toMatch(/^e-t0-\d+$/);
  });

  it('places new nodes on free ground next to the node they hang from', () => {
    const r = apply([
      { op: 'add', ref: 'novo1', service: 'aws.sqs' },
      { op: 'add', ref: 'novo2', service: 'aws.sqs' },
      { op: 'connect', from: 'app', to: 'novo1' },
      { op: 'connect', from: 'app', to: 'novo2' },
    ]);
    if (!r.ok) throw new Error(r.message);
    const app = node(r.diagram, 'app');
    const fresh = r.diagram.nodes.filter((n) => !reference.nodes.some((m) => m.id === n.id));
    for (const f of fresh) {
      for (const other of r.diagram.nodes) {
        if (other.id === f.id) continue;
        const overlap =
          Math.abs(other.position.x - f.position.x) < 85 &&
          Math.abs(other.position.y - f.position.y) < 85;
        expect(overlap, `${f.id} sobre ${other.id}`).toBe(false);
      }
      expect(Math.abs(f.position.x - (app?.position.x ?? 0))).toBeLessThan(1000);
    }
  });

  it('applies 50 operations in under 100 ms (NFR-1)', () => {
    const ops: ProposalOp[] = Array.from({ length: 25 }, (_, i) => [
      { op: 'add' as const, ref: `novo${String(i + 1)}`, service: 'aws.sqs' },
      { op: 'connect' as const, from: 'app', to: `novo${String(i + 1)}` },
    ]).flat();
    const t = performance.now();
    const r = apply(ops);
    expect(r.ok).toBe(true);
    expect(performance.now() - t).toBeLessThan(100);
  });

  it('gives browser-created nodes ids unlike the store’s own', () => {
    expect(proposalNodeId('aws.elasticache-valkey', 3)).toMatch(/^elasticache-valkey-m[0-9a-z]+3$/);
  });
});

describe('describeOp (FR-3)', () => {
  const ops: ProposalOp[] = [
    {
      op: 'add',
      ref: 'novo1',
      service: 'aws.elasticache-valkey',
      label: 'Cache 2',
      props: { hitRatio: 0.9 },
    },
    { op: 'connect', from: 'app', to: 'novo1' },
    { op: 'set_prop', node: 'app', key: 'units', value: 6 },
    { op: 'remove', node: 'cache' },
    { op: 'disconnect', from: 'app', to: 'db' },
    { op: 'rename', node: 'app', label: 'Redirecionador' },
    { op: 'set_variant', node: 'db', variant: 'db.m7g.large' },
  ];
  const lines = ops.map((op) => describeOp(op, reference, ops, catalog));

  it('says what changes in the names the person sees', () => {
    expect(lines[0]).toBe("+ ElastiCache (Valkey) 'Cache 2' (hit ratio 0.9)");
    expect(lines[1]).toBe("+ conexão 'API de redirecionamento' → 'Cache 2' (novo)");
    expect(lines[2]).toBe("'API de redirecionamento': réplicas 30 → 6");
    expect(lines[3]).toBe("− remover 'Cache de URLs'");
    expect(lines[4]).toBe("− conexão 'API de redirecionamento' → 'Banco de URLs'");
    expect(lines[5]).toBe("'API de redirecionamento': novo nome 'Redirecionador'");
    expect(lines[6]).toMatch(/^'Banco de URLs': tipo .+ → db\.m7g\.large$/);
  });
});
