import { catalog } from '@archsim/catalog';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialState, step, type NodeHealth } from '@archsim/sim-engine';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSim } from '../sim/sim-store';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { GlobalBar } from './GlobalBar';
import { HEALTH_LABEL, NodeStatus } from './NodeStatus';
import { ParticleLayer } from './ParticleLayer';
import { allocate, bezierPoint, PARTICLE_CAP, particleCount, staticStroke } from './particles';

class Observer {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Observer);
  useDiagram.getState().start({ kind: 'free' }, emptyDiagram());
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSim.setState({ result: null, status: 'idle' });
});

function scenario() {
  const s = useDiagram.getState();
  s.addNode('core.users', { x: 0, y: 0 });
  const app = s.addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
  s.connect('users', app, 'http');
  s.setLoad({
    classes: [
      {
        name: 'default',
        label: 'Requisições',
        mode: 'rps',
        op: 'read',
        rps: 400,
        payloadKB: 1,
        cacheable: true,
      },
    ],
  });
  const result = step(initialState(), useDiagram.getState().diagram, catalog, 100).result;
  useSim.setState({ result, status: 'running' });
  return { app, result };
}

describe('particles (FR-29)', () => {
  it('grows with the log of the rate', () => {
    expect(particleCount(0)).toBe(0);
    expect(particleCount(10)).toBeLessThan(particleCount(1_000_000));
    expect(particleCount(1_000_000)).toBe(18);
  });

  it('never puts more than 2,000 on screen', () => {
    const counts = allocate(new Array<number>(400).fill(1_000_000));
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(PARTICLE_CAP);
  });

  it('follows the bezier from source to target', () => {
    expect(bezierPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, 0)).toEqual({ x: 0, y: 0 });
    expect(bezierPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, 1)).toEqual({ x: 100, y: 50 });
  });

  it('thickens static edges with traffic', () => {
    expect(staticStroke(0)).toBe(1);
    expect(staticStroke(1000)).toBeGreaterThan(staticStroke(10));
  });
});

describe('NodeStatus (FR-26, FR-30, NFR-6)', () => {
  it('shows utilization, rate, latency, errors and cost with a state word', () => {
    const { app, result } = scenario();
    const m = result.nodes[app];
    if (!m) throw new Error('no metrics');
    render(<NodeStatus m={m} />);
    // t3.nano: 100 req/s for 400 → 400%, 75% errors
    expect(screen.getByText('gargalo')).toBeTruthy();
    expect(screen.getByText(/400% · 400 req\/s/)).toBeTruthy();
    expect(screen.getByText(/erro 75,0% · US\$ 3,80\/mês/)).toBeTruthy();
  });

  it('has a distinct word for every state', () => {
    const words = (
      ['healthy', 'pressured', 'critical', 'bottleneck', 'unsimulated'] as NodeHealth[]
    ).map((h) => HEALTH_LABEL[h]);
    expect(new Set(words).size).toBe(5);
  });
});

describe('GlobalBar (FR-27)', () => {
  it('names the bottleneck from the result', () => {
    scenario();
    render(
      <ReactFlowProvider>
        <GlobalBar />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole('button', { name: 'gargalo: EC2' })).toBeTruthy();
    expect(screen.getByText(/erro 75,0%/)).toBeTruthy();
  });
});

describe('reduced motion (FR-31)', () => {
  it('the particle layer never requests an animation frame when disabled', () => {
    scenario();
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    render(
      <ReactFlowProvider>
        <ParticleLayer enabled={false} />
      </ReactFlowProvider>,
    );
    expect(raf).not.toHaveBeenCalled();
  });

  it('turns the CSS pulses off', () => {
    // Vitest blanks CSS imports; read the file from whichever root the run uses.
    const path = ['apps/app/src/canvas/canvas.css', 'src/canvas/canvas.css']
      .map((p) => join(process.cwd(), p))
      .find((p) => existsSync(p));
    const canvasCss = path ? readFileSync(path, 'utf8') : '';
    expect(canvasCss).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});
