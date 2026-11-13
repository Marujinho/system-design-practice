import { describe, expect, it } from 'vitest';
import { achievements } from './achievements';
import { emptyHistory, type Attempt } from './contracts';

let clock = 0;
function attempt(over: Partial<Attempt> = {}): Attempt {
  clock += 1;
  return {
    problemId: 'p1',
    at: `2026-11-13T10:00:${String(clock).padStart(2, '0')}.000Z`,
    score: 60,
    stars: 1,
    cost: 10,
    belowReference: false,
    solutionSeen: false,
    ...over,
  };
}

const at = (h: ReturnType<typeof emptyHistory>, id: string) =>
  achievements(h).find((a) => a.id === id)?.at ?? null;

describe('achievements (FR-61)', () => {
  it('starts with everything locked', () => {
    expect(achievements(emptyHistory()).every((a) => a.at === null)).toBe(true);
  });

  it('earns the first finish once, at the first attempt', () => {
    const h = emptyHistory();
    const first = attempt({ stars: 0, score: 20 });
    h.attempts.push(first, attempt());
    expect(at(h, 'first-finish')).toBe(first.at);
  });

  it('earns three stars at exactly 3 stars, not 2', () => {
    const h = emptyHistory();
    h.attempts.push(attempt({ stars: 2 }));
    expect(at(h, 'first-three-stars')).toBeNull();
    const three = attempt({ stars: 3 });
    h.attempts.push(three);
    expect(at(h, 'first-three-stars')).toBe(three.at);
  });

  it('needs a star on all 10 problems: 9 is not enough', () => {
    const h = emptyHistory();
    for (let i = 0; i < 9; i += 1) h.attempts.push(attempt({ problemId: `p${i}` }));
    expect(at(h, 'ten-with-a-star')).toBeNull();
    h.attempts.push(attempt({ problemId: 'p9', stars: 0 }));
    expect(at(h, 'ten-with-a-star')).toBeNull();
    const tenth = attempt({ problemId: 'p9' });
    h.attempts.push(tenth);
    expect(at(h, 'ten-with-a-star')).toBe(tenth.at);
  });

  it('needs 5 below-reference badges: 4 is not enough', () => {
    const h = emptyHistory();
    for (let i = 0; i < 4; i += 1) h.attempts.push(attempt({ belowReference: true }));
    expect(at(h, 'five-below-reference')).toBeNull();
    const fifth = attempt({ belowReference: true });
    h.attempts.push(fifth);
    expect(at(h, 'five-below-reference')).toBe(fifth.at);
  });

  it('ignores attempts made after seeing the solution', () => {
    const h = emptyHistory();
    h.attempts.push(attempt({ stars: 3, solutionSeen: true }));
    expect(at(h, 'first-three-stars')).toBeNull();
    expect(at(h, 'first-finish')).toBeNull();
  });
});
