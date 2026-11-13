import { catalog } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import { perfDiagram } from '../fixtures/perf-diagram';
import { initialState, step } from './step';

describe('NFR-1', () => {
  it('runs a 50-node, 60-edge tick in ≤ 10 ms at p95 over 1,000 ticks', () => {
    const d = perfDiagram();
    expect(d.nodes).toHaveLength(50);
    expect(d.edges).toHaveLength(60);
    let state = initialState();
    const times: number[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const start = performance.now();
      state = step(state, d, catalog, 100).state;
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    console.info(`NFR-1 p95 = ${p95.toFixed(3)} ms`);
    expect(p95).toBeLessThanOrEqual(10);
  });
});
