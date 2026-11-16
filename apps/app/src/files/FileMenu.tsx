import { useRef, useState } from 'react';
import { useLang } from '../i18n/store';
import { useT } from '../i18n/t';
import { hasProblem, useDiagram } from '../store/diagram-store';
import { downloadDiagram, readDiagramFile } from './save-open';

export function FileMenu() {
  const t = useT();
  const lang = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="file-menu">
      <button
        type="button"
        className="button"
        onClick={() => {
          downloadDiagram(useDiagram.getState().diagram);
        }}
      >
        {t('files.save')}
      </button>
      <button
        type="button"
        className="button"
        onClick={() => {
          input.current?.click();
        }}
      >
        {t('files.open')}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.archsim.json,application/json"
        hidden
        aria-label={t('files.input')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void readDiagramFile(file).then((r) => {
            if (!r.ok) {
              setError(lang === 'en' ? r.messageEn : r.message);
              return;
            }
            setError(null);
            const s = useDiagram.getState();
            // In a problem, the problem's load always wins over the file's (FR-44).
            s.replaceDiagram(
              hasProblem(s.mode) ? { ...r.diagram, load: s.diagram.load } : r.diagram,
            );
          });
        }}
      />
      {error && (
        <p className="field-error" role="alert">
          {t('files.error', { error })}
        </p>
      )}
    </div>
  );
}
