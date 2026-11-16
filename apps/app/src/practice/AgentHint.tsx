import { useState } from 'react';
import { useT } from '../i18n/t';

export const CLI_COMMAND = 'pnpm -s archsim simulate --session practice/session.json';

function CopyLine({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-line">
      <code>{text}</code>
      <button
        type="button"
        className="button"
        aria-label={t('agent.copy', { label })}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
          });
        }}
      >
        {t(copied ? 'agent.copied' : 'agent.copyButton')}
      </button>
    </div>
  );
}

/** What to tell your agent once the session is saved (FR-48). */
export function AgentHint() {
  const t = useT();
  return (
    <div className="agent-hint">
      <p>{t('agent.saved')}</p>
      <CopyLine text={t('agent.phrase')} label={t('agent.phraseLabel')} />
      <p className="muted">{t('agent.orRun')}</p>
      <CopyLine text={CLI_COMMAND} label={t('agent.command')} />
    </div>
  );
}
