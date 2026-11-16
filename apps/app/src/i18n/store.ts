import { create } from 'zustand';
import { applyLang, initialLang, storeLang, type Lang } from './lang';

interface LangStore {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

/** The active language. Switching re-renders; nothing reloads or remounts (FR-2). */
export const useLangStore = create<LangStore>((set) => ({
  lang: initialLang(),
  setLang(lang) {
    applyLang(lang);
    storeLang(lang);
    set({ lang });
  },
}));

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

/** For code outside React (formatters, plain functions). */
export function currentLang(): Lang {
  return useLangStore.getState().lang;
}
