import type { PublicProblem, PublicProblemText } from '@archsim/problems';
import { create } from 'zustand';
import { useLang } from './store';

/**
 * The English texts of the problem on screen, set by the problem and study screens.
 * The diagram keeps the Portuguese labels it was created with; display goes through here.
 */
export const useProblemText = create<{
  en: PublicProblemText | null;
  set: (en: PublicProblemText | null) => void;
}>((set) => ({
  en: null,
  set: (en) => {
    set({ en });
  },
}));

/** The problem's title, statement and features in the active language (language-switch FR-7). */
export function useShownProblem(problem: PublicProblem): {
  title: string;
  statement: string;
  functional: string[];
} {
  const lang = useLang();
  return lang === 'en'
    ? {
        title: problem.en.title,
        statement: problem.en.statement,
        functional: problem.en.functional,
      }
    : { title: problem.title, statement: problem.statement, functional: problem.functional };
}

/** A load class's label in the active language, when the problem on screen has one. */
export function useClassLabel(): (c: { name: string; label: string }) => string {
  const lang = useLang();
  const en = useProblemText((s) => s.en);
  return (c) => (lang === 'en' ? (en?.classes[c.name] ?? c.label) : c.label);
}

/** A requirement's label in the active language, when the problem on screen has one. */
export function useRequirementLabel(): (r: { id: string; label: string }) => string {
  const lang = useLang();
  const en = useProblemText((s) => s.en);
  return (r) => (lang === 'en' ? (en?.requirements[r.id] ?? r.label) : r.label);
}
