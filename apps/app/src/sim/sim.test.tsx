import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadPanel, rpmFromSlider, sliderFromRpm } from '../panels/LoadPanel';
import { emptyDiagram, problemStart } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { inlineBackend } from './sim-client';
import { setBackendFactory, useSim } from './sim-store';

beforeEach(() => {
  vi.useFakeTimers();
  setBackendFactory(inlineBackend);
  useDiagram.getState().start({ kind: 'free' }, emptyDiagram());
});

afterEach(() => {
  useSim.getState().stop();
  vi.useRealTimers();
});

function withChain() {
  const s = useDiagram.getState();
  s.addNode('core.users', { x: 0, y: 0 });
  const app = s.addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
  s.connect('users', app, 'http');
  return app;
}

describe('simulation loop (FR-10, FR-38, NFR-5)', () => {
  it('emits a result every 100 ms with the current diagram', () => {
    const app = withChain();
    useSim.getState().start(useDiagram.getState().diagram);
    vi.advanceTimersByTime(100);
    expect(useSim.getState().result?.nodes[app]?.rpsIn).toBe(100);
  });

  it('follows diagram updates', () => {
    const app = withChain();
    useSim.getState().start(useDiagram.getState().diagram);
    useDiagram.getState().setProp(app, 'units', 3);
    useSim.getState().update(useDiagram.getState().diagram);
    vi.advanceTimersByTime(100);
    // default variant is t3.nano: 3 × 100 req/s
    expect(useSim.getState().result?.nodes[app]?.capacity).toBe(300);
  });

  it('freezes on pause and resumes on the next tick', () => {
    withChain();
    useSim.getState().start(useDiagram.getState().diagram);
    vi.advanceTimersByTime(100);
    const frozen = useSim.getState().result;
    useSim.getState().pause();
    vi.advanceTimersByTime(500);
    expect(useSim.getState().result).toBe(frozen);
    expect(useSim.getState().status).toBe('paused');
    useSim.getState().resume();
    vi.advanceTimersByTime(100);
    expect(useSim.getState().result).not.toBe(frozen);
  });

  it('a backend failure shows an error; restart resumes with the same diagram', () => {
    const app = withChain();
    useSim.getState().start(useDiagram.getState().diagram);
    useSim.getState().backend?.crash();
    expect(useSim.getState().status).toBe('error');
    expect(useSim.getState().error).toMatch(/falha forçada/);
    useSim.getState().restart();
    vi.advanceTimersByTime(100);
    expect(useSim.getState().status).toBe('running');
    expect(useSim.getState().result?.nodes[app]?.rpsIn).toBe(100);
    expect(useDiagram.getState().diagram.nodes).toHaveLength(2);
  });
});

describe('LoadPanel (FR-9)', () => {
  it('maps the log slider over 0 to 10M req/min', () => {
    expect(rpmFromSlider(0)).toBe(0);
    expect(rpmFromSlider(1000)).toBe(10_000_000);
    expect(rpmFromSlider(sliderFromRpm(1_000_000))).toBeCloseTo(1_000_000, -4);
  });

  it('100,000 users × 10 req/min → 16.667 req/s', async () => {
    vi.useRealTimers();
    useDiagram.getState().setLoad({
      classes: [
        {
          name: 'default',
          label: 'Requisições',
          mode: 'users',
          op: 'read',
          users: 1,
          reqPerUserPerMin: 10,
          payloadKB: 1,
          cacheable: true,
        },
      ],
    });
    render(<LoadPanel />);
    const users = screen.getByLabelText('Usuários — Requisições');
    await userEvent.clear(users);
    await userEvent.type(users, '100000{Enter}');
    expect(screen.getAllByText('16.667 req/s').length).toBeGreaterThan(0);
  });

  it('refuses more than 10M req/min', async () => {
    vi.useRealTimers();
    useDiagram.getState().setLoad({
      classes: [
        {
          name: 'default',
          label: 'Requisições',
          mode: 'rpm',
          op: 'read',
          rpm: 100,
          payloadKB: 1,
          cacheable: true,
        },
      ],
    });
    render(<LoadPanel />);
    const rpm = screen.getByLabelText('req/min — Requisições');
    await userEvent.clear(rpm);
    await userEvent.type(rpm, '10000001{Enter}');
    expect(screen.getByRole('alert').textContent).toMatch(/máximo/);
    expect(useDiagram.getState().diagram.load.classes[0]?.rpm).toBe(100);
  });

  it('is read-only in problem mode', () => {
    vi.useRealTimers();
    useDiagram.getState().start(
      { kind: 'problem', problemId: 'url-shortener' },
      problemStart({
        classes: [
          {
            name: 'r',
            label: 'Leitura',
            mode: 'rps',
            op: 'read',
            rps: 10,
            payloadKB: 1,
            cacheable: true,
          },
        ],
      }),
    );
    render(<LoadPanel />);
    expect(screen.getByLabelText<HTMLInputElement>('req/s — Leitura').disabled).toBe(true);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('Carga definida pelo problema.')).toBeTruthy();
  });
});
