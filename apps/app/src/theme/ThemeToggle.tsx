import { useState } from 'react';
import { useT } from '../i18n/t';
import { applyTheme, initialTheme, storeTheme, type Theme } from './theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = initialTheme();
    applyTheme(t);
    return t;
  });
  const t = useT();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="button"
      aria-label={t(next === 'light' ? 'theme.toLight' : 'theme.toDark')}
      onClick={() => {
        applyTheme(next);
        storeTheme(next);
        setTheme(next);
      }}
    >
      {t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
    </button>
  );
}
