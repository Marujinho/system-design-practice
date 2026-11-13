import { catalog } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import { LIMITS, parseDiagram, rpsOf, serializeDiagram, type Diagram } from './diagram';
import { diagram, edge, fixture, fixtureText, node } from './test-helpers';

function parse(d: unknown) {
  return parseDiagram(JSON.stringify(d), catalog);
}

function code(d: unknown) {
  const r = parse(d);
  return r.ok ? 'OK' : r.code;
}

function withNodes(count: number): Diagram {
  const nodes = [node('users', 'core.users', 'default')];
  for (let i = 1; i < count; i += 1) nodes.push(node(`n${i}`, 'aws.ec2', 't3.micro'));
  return diagram(nodes, []);
}

function withEdges(count: number): Diagram {
  const d = withNodes(2);
  d.edges = Array.from({ length: count }, (_, i) => ({ ...edge('users', 'n1'), id: `e${i}` }));
  return d;
}

function withClasses(count: number): Diagram {
  const classes = Array.from({ length: count }, (_, i) => ({
    name: `c${i}`,
    label: `c${i}`,
    mode: 'rps' as const,
    rps: 1,
    payloadKB: 1,
    cacheable: false,
  }));
  return diagram([node('users', 'core.users', 'default')], [], classes);
}

describe('rpsOf', () => {
  it('converts users × req/min', () => {
    expect(
      rpsOf({
        name: 'r',
        label: 'r',
        mode: 'users',
        users: 100_000,
        reqPerUserPerMin: 10,
        payloadKB: 1,
        cacheable: true,
      }),
    ).toBeCloseTo(16_666.67, 2);
  });

  it('converts req/min', () => {
    expect(
      rpsOf({ name: 'r', label: 'r', mode: 'rpm', rpm: 1_000_000, payloadKB: 1, cacheable: true }),
    ).toBeCloseTo(16_666.67, 2);
  });

  it('keeps req/s', () => {
    expect(
      rpsOf({ name: 'r', label: 'r', mode: 'rps', rps: 42, payloadKB: 1, cacheable: true }),
    ).toBe(42);
  });
});

describe('parseDiagram', () => {
  it('round-trips a valid diagram', () => {
    const d = fixture('diagrams/basic.json');
    const r = parseDiagram(serializeDiagram(d), catalog);
    expect(r.ok && r.diagram).toEqual(d);
  });

  it('parses the fixture file text', () => {
    expect(parseDiagram(fixtureText('diagrams/basic.json'), catalog).ok).toBe(true);
  });

  it('accepts 200 nodes and rejects 201', () => {
    expect(code(withNodes(LIMITS.maxNodes))).toBe('OK');
    expect(code(withNodes(LIMITS.maxNodes + 1))).toBe('TOO_MANY_NODES');
  });

  it('accepts 400 edges and rejects 401', () => {
    expect(code(withEdges(LIMITS.maxEdges))).toBe('OK');
    expect(code(withEdges(LIMITS.maxEdges + 1))).toBe('TOO_MANY_EDGES');
  });

  it('accepts 8 request classes and rejects 9', () => {
    expect(code(withClasses(8))).toBe('OK');
    expect(code(withClasses(9))).toBe('TOO_MANY_CLASSES');
  });

  it('accepts exactly 10M req/min and rejects more', () => {
    const at = withClasses(1);
    at.load.classes[0] = {
      name: 'c',
      label: 'c',
      mode: 'rpm',
      rpm: 10_000_000,
      payloadKB: 1,
      cacheable: false,
    };
    expect(code(at)).toBe('OK');
    at.load.classes[0] = { ...at.load.classes[0], rpm: 10_000_001 };
    expect(code(at)).toBe('LOAD_TOO_HIGH');
  });

  it('accepts an 80-char label and rejects 81', () => {
    const d = withNodes(1);
    d.nodes[0] = { ...node('users', 'core.users', 'default'), label: 'x'.repeat(80) };
    expect(code(d)).toBe('OK');
    d.nodes[0] = { ...d.nodes[0], label: 'x'.repeat(81) };
    expect(code(d)).toBe('LABEL_TOO_LONG');
  });

  it('rejects files over 5 MB before parsing', () => {
    const big = `{"pad":"${'x'.repeat(LIMITS.maxBytes)}"}`;
    const r = parseDiagram(big, catalog);
    expect(r.ok ? 'OK' : r.code).toBe('TOO_LARGE');
  });

  it('accepts a file of exactly 5 MB', () => {
    const base = JSON.stringify(withNodes(1));
    const padded = base.slice(0, -1) + ',"name":"a"}';
    const filler = ' '.repeat(LIMITS.maxBytes - new TextEncoder().encode(padded).byteLength);
    const text = padded.slice(0, -1) + filler + '}';
    expect(new TextEncoder().encode(text).byteLength).toBe(LIMITS.maxBytes);
    expect(parseDiagram(text, catalog).ok).toBe(true);
  });

  it('rejects broken JSON', () => {
    const r = parseDiagram('{"schemaVersion":', catalog);
    expect(r.ok ? 'OK' : r.code).toBe('INVALID_JSON');
  });

  it('rejects an unsupported schema version', () => {
    expect(code({ ...withNodes(1), schemaVersion: 2 })).toBe('UNSUPPORTED_VERSION');
  });

  it('rejects an unknown service', () => {
    expect(code(diagram([node('x', 'aws.nope', 'default')], []))).toBe('UNKNOWN_SERVICE');
  });

  it('rejects an unknown variant', () => {
    expect(code(diagram([node('x', 'aws.ec2', 'x9.huge')], []))).toBe('UNKNOWN_VARIANT');
  });

  it('rejects a property out of range', () => {
    expect(code(diagram([node('x', 'aws.ec2', 't3.micro', { units: 0 })], []))).toBe(
      'INVALID_PARAM',
    );
    expect(code(diagram([node('x', 'aws.ec2', 't3.micro', { color: 1 })], []))).toBe(
      'INVALID_PARAM',
    );
  });

  it('rejects an edge pointing to a missing node', () => {
    expect(code(diagram([node('users', 'core.users', 'default')], [edge('users', 'ghost')]))).toBe(
      'DANGLING_EDGE',
    );
  });

  it('rejects an edge using an unknown class', () => {
    const d = withNodes(2);
    d.edges = [edge('users', 'n1', { classes: ['write'] })];
    expect(code(d)).toBe('UNKNOWN_CLASS');
  });

  it('rejects two entry nodes', () => {
    const d = diagram(
      [node('u1', 'core.users', 'default'), node('u2', 'core.users', 'default')],
      [],
    );
    expect(code(d)).toBe('TOO_MANY_ENTRIES');
  });

  it('rejects duplicate ids', () => {
    const d = diagram([node('a', 'aws.ec2', 't3.micro'), node('a', 'aws.ec2', 't3.micro')], []);
    expect(code(d)).toBe('DUPLICATE_ID');
  });

  it('rejects unknown keys', () => {
    expect(code({ ...withNodes(1), extra: true })).toBe('INVALID_SCHEMA');
  });

  it('drops __proto__ without polluting Object.prototype', () => {
    const text = JSON.stringify(withNodes(1)).replace(
      '"schemaVersion":1',
      '"schemaVersion":1,"__proto__":{"polluted":true}',
    );
    const r = parseDiagram(text, catalog);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('explains each refusal in Portuguese', () => {
    const r = parse({ ...withNodes(1), schemaVersion: 2 });
    expect(r.ok ? '' : r.message).toMatch(/versão/i);
  });
});
