import { useEffect } from 'react';
import { applyLang, LANGS } from './lang';
import { useLangStore } from './store';
import { useT } from './t';

/** PT / EN in the header (FR-1). The pressed button is the active language (NFR-4). */
export function LanguageToggle() {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const t = useT();
  useEffect(() => {
    applyLang(lang);
  }, [lang]);
  return (
    <div className="lang-toggle" role="group" aria-label={t('lang.group')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className="button"
          lang={l === 'en' ? 'en' : 'pt-BR'}
          aria-pressed={lang === l}
          aria-label={t(l === 'en' ? 'lang.en' : 'lang.pt')}
          onClick={() => {
            setLang(l);
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
