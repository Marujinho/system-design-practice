import { describe, expect, it } from 'vitest';
import { version } from './index';

describe('@archsim/sim-engine', () => {
  it('reports its version', () => {
    expect(version()).toBe('0.1.0');
  });
});
