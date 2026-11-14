import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { Canvas } from './Canvas';
import { defaultProtocol, protocolFor } from './connection-rules';
import { toFlow, withMeasured } from './flow-model';
import { Palette } from './Palette';
import { DRAG_TYPE, paletteGroups } from './palette-model';

class Observer {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  useDiagram.getState().start({ kind: 'free' }, emptyDiagram());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('palette (FR-3)', () => {
  it('finds Lambda by "lam" and SQS by "sq"', () => {
    const ids = (q: string) => paletteGroups(q).flatMap((g) => g.services.map((s) => s.id));
    expect(ids('lam')).toEqual(['aws.lambda']);
    expect(ids('sq')).toContain('aws.sqs');
  });

  it('ignores case and accents', () => {
    const ids = paletteGroups('USUARIOS').flatMap((g) => g.services.map((s) => s.id));
    expect(ids).toEqual(['core.users']);
  });

  it('groups by category, all 23 nodes with an empty query', () => {
    const groups = paletteGroups('');
    expect(groups.map((g) => g.label)).toContain('Mensageria');
    expect(groups.flatMap((g) => g.services)).toHaveLength(23);
  });

  it('adds a service with click and with Enter on the focused item', async () => {
    const onAdd = vi.fn();
    render(<Palette onAdd={onAdd} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar serviço' }), 'lam');
    const item = screen.getByRole('button', { name: 'Lambda' });
    await userEvent.click(item);
    item.focus();
    await userEvent.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenCalledWith('aws.lambda');
  });

  it('carries the service id when dragged', () => {
    render(<Palette onAdd={vi.fn()} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: 'SQS' }), {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith(DRAG_TYPE, 'aws.sqs');
  });
});

describe('connection rules (FR-5, FR-6)', () => {
  it('infers the default protocol from the kinds', () => {
    expect(defaultProtocol('load-balancer', 'compute')).toBe('http');
    expect(defaultProtocol('compute', 'sql-database')).toBe('tcp');
    expect(defaultProtocol('pubsub', 'queue')).toBe('queue');
    expect(defaultProtocol('pubsub', 'function')).toBe('pubsub');
    expect(defaultProtocol('compute', 'queue')).toBe('queue');
  });

  it('applies it to node ids of a diagram', () => {
    const s = useDiagram.getState();
    const alb = s.addNode('aws.alb', { x: 0, y: 0 }) ?? '';
    const ec2 = s.addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    const sns = s.addNode('aws.sns', { x: 0, y: 0 }) ?? '';
    const sqs = s.addNode('aws.sqs', { x: 0, y: 0 }) ?? '';
    const d = useDiagram.getState().diagram;
    expect(protocolFor(d, alb, ec2)).toBe('http');
    expect(protocolFor(d, sns, sqs)).toBe('queue');
  });

  it('creates an unusual connection with a warning, never blocks it', () => {
    const s = useDiagram.getState();
    const s3 = s.addNode('aws.s3', { x: 0, y: 0 }) ?? '';
    const rds = s.addNode('aws.rds-postgres', { x: 0, y: 0 }) ?? '';
    expect(s.connect(s3, rds, 'tcp')).not.toBeNull();
    const { edges } = toFlow(useDiagram.getState().diagram, []);
    expect(edges[0]?.data?.warning).toMatch(/S3 → RDS PostgreSQL/);
  });
});

describe('Canvas', () => {
  it('shows the empty state', () => {
    render(<Canvas />);
    expect(screen.getByText('Arraste um serviço ou comece por Usuários.')).toBeTruthy();
  });

  it('creates a node where a palette item is dropped', () => {
    const { container } = render(<Canvas />);
    const canvas = container.querySelector('.canvas');
    if (!canvas) throw new Error('no canvas');
    fireEvent.drop(canvas, {
      clientX: 100,
      clientY: 80,
      dataTransfer: { getData: () => 'aws.lambda', types: [DRAG_TYPE] },
    });
    const nodes = useDiagram.getState().diagram.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.serviceId).toBe('aws.lambda');
  });

  it('undoes with Cmd+Z and redoes with Cmd+Shift+Z', async () => {
    render(<Canvas />);
    useDiagram.getState().addNode('aws.ec2', { x: 0, y: 0 });
    await userEvent.keyboard('{Meta>}z{/Meta}');
    expect(useDiagram.getState().diagram.nodes).toHaveLength(0);
    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(useDiagram.getState().diagram.nodes).toHaveLength(1);
  });
});

describe('withMeasured (edge-hover T2a)', () => {
  const two = () => {
    const s = useDiagram.getState();
    s.addNode('aws.ec2', { x: 0, y: 0 });
    s.addNode('aws.rds-postgres', { x: 300, y: 0 });
    return toFlow(useDiagram.getState().diagram, []).nodes;
  };

  it('gives a measured node its size back, so React Flow keeps its handles', () => {
    const [a, b] = two();
    if (!a || !b) throw new Error('add failed');
    const out = withMeasured([a, b], new Map([[a.id, { width: 120, height: 64 }]]));
    expect(out[0]?.measured).toEqual({ width: 120, height: 64 });
    expect(out[1]).toBe(b);
  });

  it('leaves every node as it is when nothing was measured yet', () => {
    const nodes = two();
    const out = withMeasured(nodes, new Map());
    expect(out).toHaveLength(2);
    out.forEach((n, i) => {
      expect(n).toBe(nodes[i]);
    });
  });
});

describe('instance type on the node card (aws-instance-types FR-13)', () => {
  it('passes the type to the card data', () => {
    const id = useDiagram.getState().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    const { nodes } = toFlow(useDiagram.getState().diagram, []);
    expect(nodes.find((n) => n.id === id)?.data.variantId).toBe('t3.nano');
  });

  it('shows the type and follows a change of type', () => {
    const id = useDiagram.getState().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    const { container } = render(<Canvas />);
    const card = () => container.querySelector('.service-node');
    expect(card()?.querySelector('.service-node-variant')?.textContent).toBe('t3.nano');
    act(() => {
      useDiagram.getState().setVariant(id, 'c5.xlarge');
    });
    expect(card()?.querySelector('.service-node-variant')?.textContent).toBe('c5.xlarge');
  });

  it('shows no type on a service that has only one', () => {
    useDiagram.getState().addNode('aws.alb', { x: 0, y: 0 });
    const { container } = render(<Canvas />);
    expect(container.querySelector('.service-node')).not.toBeNull();
    expect(container.querySelector('.service-node-variant')).toBeNull();
  });

  it('shows nothing, and does not break, for a type the catalog does not know (A10)', () => {
    const d = emptyDiagram();
    d.nodes.push({
      id: 'app',
      serviceId: 'aws.ec2',
      variantId: 'x9.mega',
      position: { x: 0, y: 0 },
      label: 'App',
      props: {},
      overrides: {},
    });
    useDiagram.getState().start({ kind: 'free' }, d);
    const { container } = render(<Canvas />);
    expect(container.querySelector('.service-node')).not.toBeNull();
    expect(container.querySelector('.service-node-variant')).toBeNull();
  });
});
