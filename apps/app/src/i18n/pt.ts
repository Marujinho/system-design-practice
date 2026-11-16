/** The source texts (Portuguese). Every key must exist in `en.ts` too — the type enforces it (NFR-2). */
export const pt = {
  'lang.group': 'Idioma',
  'lang.pt': 'Português',
  'lang.en': 'English',
  'theme.toLight': 'Mudar para o tema claro',
  'theme.toDark': 'Mudar para o tema escuro',
  'theme.light': 'Tema claro',
  'theme.dark': 'Tema escuro',
} as const;

export type Key = keyof typeof pt;
