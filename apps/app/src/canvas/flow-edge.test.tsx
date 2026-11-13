import { Position, type EdgeProps } from '@xyflow/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { FlowEdge, HOVER_GRACE_MS, type FlowFlowEdge } from './FlowEdge';

// jsdom has no layout, so React Flow never draws edges or mounts the label layer:
// render the label in place and test the edge on its own (the e2e covers the real canvas).
vi.mock('@xyflow/react', async (original) => ({
  ...(await original<typeof import('@xyflow/react')>()),
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const s = () => useDiagram.getState();

function edgeProps(
  id: string,
  over: Partial<EdgeProps<FlowFlowEdge>> = {},
): EdgeProps<FlowFlowEdge> {
  return {
    id,
    source: 'a',
    target: 'b',
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 0,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { warning: null, caption: '' },
    selected: false,
    ...over,
  };
}

function renderEdge(props: EdgeProps<FlowFlowEdge>) {
  // no <svg> wrapper: inside one React would make the label's <button> an SVG element
  const view = render(<FlowEdge {...props} />);
  const g = view.container.querySelector('g');
  if (!g) throw new Error('no edge group');
  return { ...view, g };
}

const removeButton = () => screen.queryByRole('button', { name: 'Remover conexão' });

let ab = '';
let ac = '';
let c = '';

beforeEach(() => {
  s().start({ kind: 'free' }, emptyDiagram());
  const a = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
  const b = s().addNode('aws.rds-postgres', { x: 300, y: 0 }) ?? '';
  c = s().addNode('aws.elasticache-valkey', { x: 300, y: 200 }) ?? '';
  ab = s().connect(a, b, 'tcp') ?? '';
  ac = s().connect(a, c, 'tcp') ?? '';
  s().select([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FlowEdge remove (edge-hover FR-1, FR-4, FR-5, FR-7)', () => {
  it('hides the button when neither hovered nor selected', () => {
    renderEdge(edgeProps(ab));
    expect(removeButton()).toBeNull();
  });

  it('shows the button on hover and hides it once the pointer has left', () => {
    vi.useFakeTimers();
    const { g } = renderEdge(edgeProps(ab));
    fireEvent.mouseEnter(g);
    expect(removeButton()).not.toBeNull();
    fireEvent.mouseLeave(g);
    act(() => {
      vi.advanceTimersByTime(HOVER_GRACE_MS - 1);
    });
    expect(removeButton()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(removeButton()).toBeNull();
  });

  it('keeps the button while the pointer travels from the line to it', () => {
    vi.useFakeTimers();
    const { g } = renderEdge(edgeProps(ab));
    fireEvent.mouseEnter(g);
    fireEvent.mouseLeave(g);
    const button = removeButton();
    if (!button) throw new Error('no button');
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(HOVER_GRACE_MS * 2);
    });
    expect(removeButton()).not.toBeNull();
  });

  it('shows the button on a selected edge, so the keyboard can reach it', () => {
    renderEdge(edgeProps(ab, { selected: true }));
    expect(removeButton()?.tagName).toBe('BUTTON');
  });

  it('removes only this edge and leaves the selection alone', () => {
    s().select([c]);
    renderEdge(edgeProps(ab, { selected: true }));
    const button = removeButton();
    if (!button) throw new Error('no button');
    fireEvent.click(button);
    expect(s().diagram.edges.map((e) => e.id)).toEqual([ac]);
    expect(s().diagram.nodes).toHaveLength(3);
    expect(s().selection).toEqual([c]);
  });

  it('keeps the click and the key presses away from the canvas', () => {
    const onPointerDown = vi.fn();
    const onClick = vi.fn();
    render(
      <div onPointerDown={onPointerDown} onClick={onClick}>
        <FlowEdge {...edgeProps(ab, { selected: true })} />
      </div>,
    );
    const button = removeButton();
    if (!button) throw new Error('no button');
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    // React Flow skips its Delete/Backspace handler for targets inside .nokey
    expect(button.classList).toContain('nokey');
    expect(button.classList).toContain('nodrag');
    expect(button.classList).toContain('nopan');
  });

  it('shows the warning and the button together', () => {
    renderEdge(
      edgeProps(ab, { selected: true, data: { warning: 'S3 → RDS PostgreSQL', caption: '30%' } }),
    );
    expect(screen.getByRole('img', { name: 'S3 → RDS PostgreSQL' })).not.toBeNull();
    expect(screen.getByText('30%')).not.toBeNull();
    expect(removeButton()).not.toBeNull();
  });

  it('names the button with fixed text, whatever the caption holds (A05)', () => {
    const { container } = renderEdge(
      edgeProps(ab, {
        selected: true,
        data: { warning: '<img src=x onerror=alert(1)>', caption: '<img src=x>' },
      }),
    );
    expect(container.querySelector('img')).toBeNull();
    expect(removeButton()?.getAttribute('aria-label')).toBe('Remover conexão');
  });

  it('does nothing when the edge is already gone', () => {
    renderEdge(edgeProps('e-gone', { selected: true }));
    const steps = s().history.past.length;
    const button = removeButton();
    if (!button) throw new Error('no button');
    fireEvent.click(button);
    expect(s().diagram.edges).toHaveLength(2);
    expect(s().history.past.length).toBe(steps);
  });
});
