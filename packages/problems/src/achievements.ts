import type { Attempt, History } from './contracts';

export interface Achievement {
  id: 'first-finish' | 'first-three-stars' | 'ten-with-a-star' | 'five-below-reference';
  title: string;
  description: string;
  /** The same in English (language-switch FR-7). */
  en: { title: string; description: string };
  /** When it was earned, or null while still locked. */
  at: string | null;
}

const DEFS: Omit<Achievement, 'at'>[] = [
  {
    id: 'first-finish',
    title: 'Primeira entrega',
    description: 'Finalizar um problema pela primeira vez.',
    en: { title: 'First delivery', description: 'Finish a problem for the first time.' },
  },
  {
    id: 'first-three-stars',
    title: 'Três estrelas',
    description: 'Tirar 3 estrelas num problema.',
    en: { title: 'Three stars', description: 'Get 3 stars on a problem.' },
  },
  {
    id: 'ten-with-a-star',
    title: 'Banco completo',
    description: 'Ter pelo menos 1 estrela nos 10 problemas.',
    en: { title: 'Full set', description: 'Have at least 1 star on all 10 problems.' },
  },
  {
    id: 'five-below-reference',
    title: 'Mais barato que a referência',
    description: 'Ganhar o selo abaixo da referência 5 vezes.',
    en: {
      title: 'Cheaper than the reference',
      description: 'Earn the below-the-reference badge 5 times.',
    },
  },
];

/**
 * Local achievements, replayed from the history in order (FR-61). Attempts
 * made after seeing the solution do not count, as for records.
 */
export function achievements(history: History, totalProblems = 10): Achievement[] {
  const earned = new Map<Achievement['id'], string>();
  const starred = new Set<string>();
  let below = 0;
  const attempts: Attempt[] = [...history.attempts]
    .filter((a) => !a.solutionSeen)
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const a of attempts) {
    if (!earned.has('first-finish')) earned.set('first-finish', a.at);
    if (a.stars === 3 && !earned.has('first-three-stars')) earned.set('first-three-stars', a.at);
    if (a.stars >= 1) starred.add(a.problemId);
    if (starred.size >= totalProblems && !earned.has('ten-with-a-star'))
      earned.set('ten-with-a-star', a.at);
    if (a.belowReference) below += 1;
    if (below >= 5 && !earned.has('five-below-reference')) earned.set('five-below-reference', a.at);
  }
  return DEFS.map((d) => ({ ...d, at: earned.get(d.id) ?? null }));
}
