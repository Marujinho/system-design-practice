import { useState } from 'react';
import { useLang } from '../i18n/store';
import { useT } from '../i18n/t';
import { catalog } from '@archsim/catalog';
import { DRAG_TYPE, paletteGroups } from './palette-model';

export function Palette({ onAdd }: { onAdd: (serviceId: string) => void }) {
  const [query, setQuery] = useState('');
  const lang = useLang();
  const t = useT();
  const groups = paletteGroups(query, catalog.services, lang);
  return (
    <aside className="palette" aria-label={t('palette.label')}>
      <input
        type="search"
        className="palette-search"
        placeholder={t('palette.search')}
        aria-label={t('palette.search')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      {groups.length === 0 && <p className="muted">{t('palette.none')}</p>}
      {groups.map((g) => (
        <section key={g.category} aria-label={g.label}>
          <h3>{g.label}</h3>
          <ul>
            {g.services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="palette-item"
                  draggable
                  title={s.description}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, s.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    onAdd(s.id);
                  }}
                >
                  <span className="palette-item-label">{s.label}</span>
                  {s.fullName !== undefined && (
                    <>
                      {/* Keeps "SQS Simple Queue Service" apart in the accessible name. */}{' '}
                      <span className="palette-item-full">{s.fullName}</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
