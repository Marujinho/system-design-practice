import { useState } from 'react';

export const AGENT_PHRASE = 'Pode começar os follow-ups do ArchSim';
export const CLI_COMMAND = 'pnpm -s archsim simulate --session practice/session.json';

function CopyLine({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-line">
      <code>{text}</code>
      <button
        type="button"
        className="button"
        aria-label={`Copiar ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
          });
        }}
      >
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

/** What to tell your agent once the session is saved (FR-48). */
export function AgentHint() {
  return (
    <div className="agent-hint">
      <p>Sessão gravada. Peça ao seu agente:</p>
      <CopyLine text={AGENT_PHRASE} label="frase para o agente" />
      <p className="muted">Ou rode a simulação você mesmo:</p>
      <CopyLine text={CLI_COMMAND} label="comando" />
    </div>
  );
}
