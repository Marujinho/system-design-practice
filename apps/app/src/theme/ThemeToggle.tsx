import { useState } from 'react';
import { applyTheme, initialTheme, storeTheme, type Theme } from './theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = initialTheme();
    applyTheme(t);
    return t;
  });
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="button"
      aria-label={`Mudar para o tema ${next === 'light' ? 'claro' : 'escuro'}`}
      onClick={() => {
        applyTheme(next);
        storeTheme(next);
        setTheme(next);
      }}
    >
      {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
    </button>
  );
}
