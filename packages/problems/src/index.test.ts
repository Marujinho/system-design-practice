import { describe, expect, it } from 'vitest';
import { version } from './index';

describe('@archsim/problems', () => {
  it('reports its version', () => {
    expect(version()).toBe('0.1.0');
  });
});
