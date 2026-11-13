import { describe, expect, it } from 'vitest';
import { freeSpot } from './Workspace';

describe('freeSpot', () => {
  it('returns the centre when it is free', () => {
    expect(freeSpot({ x: 0, y: 0 }, [])).toEqual({ x: 0, y: 0 });
  });

  it('cascades past occupied spots', () => {
    expect(
      freeSpot({ x: 0, y: 0 }, [
        { x: 0, y: 0 },
        { x: 40, y: 40 },
      ]),
    ).toEqual({ x: 80, y: 80 });
  });
});
