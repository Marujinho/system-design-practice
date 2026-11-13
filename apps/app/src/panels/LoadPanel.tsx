import { LIMITS, rpsOf, totalRps, type Load, type RequestClass } from '@archsim/sim-engine';
import { useState } from 'react';
import { formatCompact, formatRps } from '../format';
import { FileMenu } from '../files/FileMenu';
import { useSim } from '../sim/sim-store';
import { useDiagram } from '../store/diagram-store';

const MAX_RPM = LIMITS.maxTotalRpm;
const SLIDER_STEPS = 1000;

/** Logarithmic slider position ↔ req/min, 0 to 10M (FR-9). */
export function rpmFromSlider(pos: number): number {
  if (pos <= 0) return 0;
  return Math.round(10 ** ((pos / SLIDER_STEPS) * Math.log10(MAX_RPM)));
}

export function sliderFromRpm(rpm: number): number {
  if (rpm <= 1) return 0;
  return Math.round((Math.log10(rpm) / Math.log10(MAX_RPM)) * SLIDER_STEPS);
}

function withRate(c: RequestClass, rpm: number): RequestClass {
  switch (c.mode) {
    case 'users': {
      const per = c.reqPerUserPerMin ?? 1;
      return { ...c, users: per > 0 ? rpm / per : 0 };
    }
    case 'rps':
      return { ...c, rps: rpm / 60 };
    case 'rpm':
      return { ...c, rpm };
  }
}

function ClassRow({
  c,
  locked,
  onChange,
}: {
  c: RequestClass;
  locked: boolean;
  onChange: (next: RequestClass) => void;
}) {
  const rpm = rpsOf(c) * 60;
  const num = (label: string, value: number | undefined, apply: (n: number) => RequestClass) => (
    <label className="load-field">
      <span>{label}</span>
      <input
        className="num"
        inputMode="decimal"
        aria-label={`${label} — ${c.label}`}
        disabled={locked}
        defaultValue={value ?? 0}
        key={`${label}-${value ?? 0}`}
        onBlur={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(n) && n >= 0) onChange(apply(n));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
  return (
    <div className="load-class">
      <strong>{c.label}</strong>
      {!locked && (
        <select
          aria-label={`Modo de carga — ${c.label}`}
          value={c.mode}
          onChange={(e) => {
            const mode = e.target.value as RequestClass['mode'];
            onChange(withRate({ ...c, mode, reqPerUserPerMin: c.reqPerUserPerMin ?? 10 }, rpm));
          }}
        >
          <option value="users">usuários × req/min</option>
          <option value="rps">req/s</option>
          <option value="rpm">req/min</option>
        </select>
      )}
      {c.mode === 'users' && (
        <>
          {num('Usuários', c.users, (n) => ({ ...c, users: n }))}
          {num('req/usuário/min', c.reqPerUserPerMin, (n) => ({ ...c, reqPerUserPerMin: n }))}
        </>
      )}
      {c.mode === 'rps' && num('req/s', c.rps, (n) => ({ ...c, rps: n }))}
      {c.mode === 'rpm' && num('req/min', c.rpm, (n) => ({ ...c, rpm: n }))}
      {!locked && (
        <input
          type="range"
          aria-label={`Carga (escala logarítmica) — ${c.label}`}
          min={0}
          max={SLIDER_STEPS}
          value={sliderFromRpm(rpm)}
          onChange={(e) => {
            onChange(withRate(c, rpmFromSlider(Number(e.target.value))));
          }}
        />
      )}
      <span className="num load-total">{formatRps(rpsOf(c))}</span>
    </div>
  );
}

/** The load of the Users node, the pause control and the worker's status. */
export function LoadPanel() {
  const load = useDiagram((s) => s.diagram.load);
  const locked = useDiagram((s) => s.mode.kind === 'problem');
  const status = useSim((s) => s.status);
  const error = useSim((s) => s.error);
  const [refusal, setRefusal] = useState<string | null>(null);

  const apply = (index: number, next: RequestClass) => {
    const classes = load.classes.map((c, i) => (i === index ? next : c));
    const candidate: Load = { classes };
    if (totalRps(candidate) * 60 > MAX_RPM) {
      setRefusal(`A carga total passa do máximo de ${formatCompact(MAX_RPM)} req/min.`);
      return;
    }
    setRefusal(null);
    useDiagram.getState().setLoad(candidate);
  };

  return (
    <section className="load-panel" aria-label="Carga">
      <div className="load-classes">
        {load.classes.map((c, i) => (
          <ClassRow
            key={c.name}
            c={c}
            locked={locked}
            onChange={(next) => {
              apply(i, next);
            }}
          />
        ))}
        {locked && <span className="muted">Carga definida pelo problema.</span>}
      </div>
      <div className="load-status">
        <span className="num">Total: {formatRps(totalRps(load))}</span>
        <FileMenu />
        {status === 'running' && (
          <button
            type="button"
            className="button"
            onClick={() => {
              useSim.getState().pause();
            }}
          >
            Pausar
          </button>
        )}
        {status === 'paused' && (
          <button
            type="button"
            className="button"
            onClick={() => {
              useSim.getState().resume();
            }}
          >
            Retomar
          </button>
        )}
      </div>
      {refusal && (
        <p className="field-error" role="alert">
          {refusal}
        </p>
      )}
      {status === 'error' && (
        <div className="banner" role="alert">
          Simulação parou: {error}
          <button
            type="button"
            className="button"
            onClick={() => {
              useSim.getState().restart();
            }}
          >
            Reiniciar
          </button>
        </div>
      )}
    </section>
  );
}
