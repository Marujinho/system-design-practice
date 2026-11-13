import { catalog } from '@archsim/catalog';
import { LIMITS, parseDiagram, serializeDiagram } from '@archsim/sim-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave, keyOf, loadSaved, save } from './autosave';
import { emptyDiagram, problemStart } from './defaults';
import { useDiagram } from './diagram-store';
import { HISTORY_LIMIT } from './history';

const s = () => useDiagram.getState();

beforeEach(() => {
  s().start({ kind: 'free' }, emptyDiagram());
});

describe('editing (FR-1)', () => {
  it('adds, connects and removes a selection with its edges', () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 });
    const b = s().addNode('aws.ec2', { x: 100, y: 0 });
    const c = s().addNode('aws.rds-postgres', { x: 200, y: 0 });
    if (!a || !b || !c) throw new Error('add failed');
    s().connect(a, c, 'tcp');
    s().connect(b, c, 'tcp');
    s().select([a, b]);
    s().removeSelection();
    expect(s().diagram.nodes.map((n) => n.id)).toEqual([c]);
    expect(s().diagram.edges).toEqual([]);
  });

  it('allows only one Users node', () => {
    expect(s().addNode('core.users', { x: 0, y: 0 })).toBe('users');
    expect(s().addNode('core.users', { x: 0, y: 0 })).toBeNull();
    expect(s().notice).toMatch(/Usuários/);
  });

  it('refuses the 201st node and the 401st edge (NFR-3)', () => {
    const d = emptyDiagram();
    d.nodes = Array.from({ length: LIMITS.maxNodes }, (_, i) => ({
      id: `n${i}`,
      serviceId: 'aws.ec2',
      variantId: 't3.micro',
      position: { x: 0, y: 0 },
      label: '',
      props: {},
      overrides: {},
    }));
    d.edges = Array.from({ length: LIMITS.maxEdges }, (_, i) => ({
      id: `e${i}`,
      source: 'n0',
      target: `n${(i % 199) + 1}`,
      protocol: 'http' as const,
    }));
    s().start({ kind: 'free' }, d);
    expect(s().addNode('aws.ec2', { x: 0, y: 0 })).toBeNull();
    expect(s().notice).toMatch(/200/);
    expect(s().connect('n5', 'n6', 'http')).toBeNull();
    expect(s().notice).toMatch(/400/);
  });

  it('validates property ranges', () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    expect(s().setProp(a, 'units', 0)).toBe(false);
    expect(s().setProp(a, 'units', 3)).toBe(true);
    expect(s().diagram.nodes[0]?.props.units).toBe(3);
  });

  it('drops overrides the new variant does not have', () => {
    const a = s().addNode('aws.sqs', { x: 0, y: 0 }) ?? '';
    s().setVariant(a, 'fifo');
    s().setOverride(a, 'callsPerSecond', 600);
    s().setOverride(a, 'capPerUnit', 50);
    s().setVariant(a, 'standard');
    expect(s().diagram.nodes[0]?.overrides).toEqual({ capPerUnit: 50 });
  });

  it('sets and resets overrides', () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    s().setOverride(a, 'capPerUnit', 150);
    expect(s().diagram.nodes[0]?.overrides).toEqual({ capPerUnit: 150 });
    s().resetOverride(a, 'capPerUnit');
    expect(s().diagram.nodes[0]?.overrides).toEqual({});
  });
});

describe('undo / redo (FR-2)', () => {
  it('restores a deleted node with its props and edges, then deletes it again', () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    const b = s().addNode('aws.rds-postgres', { x: 9, y: 9 }) ?? '';
    s().setProp(a, 'units', 4);
    s().connect(a, b, 'tcp');
    const before = structuredClone(s().diagram);
    s().select([a]);
    s().removeSelection();
    s().undo();
    expect(s().diagram).toEqual(before);
    s().redo();
    expect(s().diagram.nodes.map((n) => n.id)).toEqual([b]);
  });

  it(`keeps only the last ${HISTORY_LIMIT} steps`, () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    for (let i = 0; i < 101; i += 1) s().setLabel(a, `l${i}`);
    expect(s().history.past).toHaveLength(HISTORY_LIMIT);
  });

  it('records a whole drag as one step', () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    const steps = s().history.past.length;
    s().moveNodes({ [a]: { x: 10, y: 0 } }, false);
    s().moveNodes({ [a]: { x: 20, y: 0 } }, false);
    s().moveNodes({ [a]: { x: 30, y: 0 } }, true);
    expect(s().history.past.length).toBe(steps + 1);
    s().undo();
    expect(s().diagram.nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });
});

describe('removeEdge (edge-hover FR-2, FR-3, FR-6)', () => {
  const three = () => {
    const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    const b = s().addNode('aws.rds-postgres', { x: 100, y: 0 }) ?? '';
    const c = s().addNode('aws.elasticache-valkey', { x: 200, y: 0 }) ?? '';
    const ab = s().connect(a, b, 'tcp') ?? '';
    const ac = s().connect(a, c, 'tcp') ?? '';
    return { a, b, c, ab, ac };
  };

  it('removes only that edge and keeps nodes and the selection', () => {
    const { c, ab, ac } = three();
    s().select([c]);
    s().removeEdge(ab);
    expect(s().diagram.edges.map((e) => e.id)).toEqual([ac]);
    expect(s().diagram.nodes).toHaveLength(3);
    expect(s().selection).toEqual([c]);
  });

  it('drops the removed edge from the selection, and only it', () => {
    const { c, ab } = three();
    s().select([ab, c]);
    s().removeEdge(ab);
    expect(s().selection).toEqual([c]);
  });

  it('undoes to the identical edge and redoes the removal', () => {
    const { ab } = three();
    s().setEdge(ab, { protocol: 'grpc', weight: 0.3, classes: ['leitura'] });
    const before = structuredClone(s().diagram);
    s().removeEdge(ab);
    s().undo();
    expect(s().diagram).toEqual(before);
    s().redo();
    expect(s().diagram.edges.some((e) => e.id === ab)).toBe(false);
  });

  it('does nothing for an id that is not there (A10)', () => {
    three();
    const diagram = s().diagram;
    const steps = s().history.past.length;
    s().removeEdge('e-missing');
    expect(s().diagram).toBe(diagram);
    expect(s().history.past.length).toBe(steps);
  });

  it('leaves a diagram that saves and reopens unchanged (A08)', () => {
    const { ab } = three();
    s().removeEdge(ab);
    const reopened = parseDiagram(serializeDiagram(s().diagram), catalog);
    expect(reopened.ok && reopened.diagram).toEqual(s().diagram);
  });
});

describe('problem mode (FR-44)', () => {
  const load = {
    classes: [
      {
        name: 'read',
        label: 'r',
        mode: 'rps' as const,
        op: 'read' as const,
        rps: 10,
        payloadKB: 1,
        cacheable: true,
      },
    ],
  };

  it('locks the load', () => {
    s().start({ kind: 'problem', problemId: 'url-shortener' }, problemStart(load));
    expect(s().setLoad({ classes: [{ ...load.classes[0], rps: 1 }] } as typeof load)).toBe(false);
    expect(s().diagram.load).toEqual(load);
  });

  it('keeps the Users node when the selection includes it', () => {
    s().start({ kind: 'problem', problemId: 'url-shortener' }, problemStart(load));
    s().select(['users']);
    s().removeSelection();
    expect(s().diagram.nodes.map((n) => n.id)).toEqual(['users']);
  });

  it('lets the free mode change the load', () => {
    expect(s().setLoad(load)).toBe(true);
  });
});

describe('autosave (FR-36, A08, A10)', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('saves after a pause and restores after reload', () => {
    vi.useFakeTimers();
    const a = createAutosave();
    const d = problemStart(emptyDiagram().load);
    a.schedule({ kind: 'free' }, d);
    expect(localStorage.getItem(keyOf({ kind: 'free' }))).toBeNull();
    vi.advanceTimersByTime(500);
    expect(loadSaved({ kind: 'free' })).toEqual(d);
  });

  it('keeps one save per problem', () => {
    save({ kind: 'problem', problemId: 'a' }, problemStart(emptyDiagram().load));
    expect(loadSaved({ kind: 'problem', problemId: 'a' })).not.toBeNull();
    expect(loadSaved({ kind: 'problem', problemId: 'b' })).toBeNull();
  });

  it('ignores a corrupted save', () => {
    localStorage.setItem(
      keyOf({ kind: 'free' }),
      '{"schemaVersion":1, "__proto__": {"x": 1}, "nodes": [',
    );
    expect(loadSaved({ kind: 'free' })).toBeNull();
    localStorage.setItem(
      keyOf({ kind: 'free' }),
      serializeDiagram({
        ...emptyDiagram(),
        nodes: [
          {
            id: 'x',
            serviceId: 'aws.nope',
            variantId: 'v',
            position: { x: 0, y: 0 },
            label: '',
            props: {},
            overrides: {},
          },
        ],
      }),
    );
    expect(loadSaved({ kind: 'free' })).toBeNull();
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSaved({ kind: 'free' }, broken)).toBeNull();
    expect(() => {
      save({ kind: 'free' }, emptyDiagram(), broken);
    }).not.toThrow();
  });
});
