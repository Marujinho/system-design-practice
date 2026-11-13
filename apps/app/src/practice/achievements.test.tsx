import { emptyHistory } from '@archsim/problems';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Achievements } from './Achievements';

describe('Achievements panel (FR-61)', () => {
  it('shows each achievement once, earned with its date or locked', () => {
    const h = emptyHistory();
    h.attempts.push({
      problemId: 'p',
      at: '2026-11-13T10:00:00.000Z',
      score: 93,
      stars: 3,
      cost: 1,
      belowReference: false,
      solutionSeen: false,
    });
    render(<Achievements history={h} />);
    expect(screen.getAllByText('Primeira entrega')).toHaveLength(1);
    expect(screen.getAllByText('conquistada em 13/11/2026')).toHaveLength(2);
    expect(screen.getAllByText('bloqueada')).toHaveLength(2);
  });
});
