import { useEffect, useId, useState } from 'react';
import { formatCompact } from '../format';

export interface ParamFieldProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Returns false when the store refused the value. */
  onCommit: (value: number) => boolean;
}

/** A numeric field that refuses values outside its range and says what the range is (FR-7). */
export function ParamField({ label, unit, value, min, max, step, onCommit }: ParamFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(String(value));
    setError(null);
  }, [value]);

  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(n) || n < min || n > max || !onCommit(n)) {
      setError(`Use um valor entre ${formatCompact(min)} e ${formatCompact(max)}.`);
      return;
    }
    setError(null);
  };

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit !== '' && <span className="muted"> ({unit})</span>}
      </label>
      <input
        id={id}
        className="num"
        inputMode="decimal"
        value={text}
        step={step}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
