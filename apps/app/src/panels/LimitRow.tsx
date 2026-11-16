import { useState } from 'react';
import { formatCompact } from '../format';
import { useT } from '../i18n/t';

export interface LimitRowProps {
  label: string;
  unit: string;
  catalogValue: number;
  value: number;
  source: 'aws-quota' | 'assumption';
  sourceUrl?: string | undefined;
  onOverride: (value: number) => void;
  onReset: () => void;
}

/** One number from the catalog: AWS quota (with its source) or assumption, editable (FR-8). */
export function LimitRow({
  label,
  unit,
  catalogValue,
  value,
  source,
  sourceUrl,
  onOverride,
  onReset,
}: LimitRowProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const changed = value !== catalogValue;

  return (
    <li className="limit">
      <div className="limit-head">
        <span>{label}</span>
        {source === 'aws-quota' ? (
          sourceUrl ? (
            <a className="badge quota" href={sourceUrl} target="_blank" rel="noreferrer noopener">
              {t('limit.quota')}
            </a>
          ) : (
            <span className="badge quota">{t('limit.quota')}</span>
          )
        ) : (
          <span className="badge assumption">{t('limit.assumption')}</span>
        )}
      </div>
      <div className="limit-value">
        {editing ? (
          <input
            className="num"
            aria-label={t('limit.newValue', { label })}
            value={text}
            autoFocus
            onChange={(e) => {
              setText(e.target.value);
            }}
            onBlur={() => {
              const n = Number(text.replace(',', '.'));
              if (Number.isFinite(n) && n >= 0) onOverride(n);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="link-button num"
            aria-label={t('limit.edit', { label, value: formatCompact(value, 4), unit })}
            onClick={() => {
              setText(String(value));
              setEditing(true);
            }}
          >
            {formatCompact(value, 4)} {unit}
          </button>
        )}
        {changed && (
          <>
            <span className="badge changed">{t('limit.changed')}</span>
            <button type="button" className="link-button" onClick={onReset}>
              {t('limit.reset')}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
