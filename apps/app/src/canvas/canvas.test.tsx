import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { Canvas } from './Canvas';
import { defaultProtocol, protocolFor } from './connection-rules';
import { toFlow } from './flow-model';
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
