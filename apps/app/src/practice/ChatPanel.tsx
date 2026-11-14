import type {
  MentorErrorCode,
  MentorMessage,
  MentorProviderId,
  MentorStatus,
  MentorUsage,
} from '@archsim/problems';
import { MAX_MESSAGE_CHARS } from '@archsim/problems';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import { useDiagram } from '../store/diagram-store';
import { browserStorage } from '../theme/theme';
import { useLayout } from '../workspace/layout-store';
import { ApiError } from './api';
import { mentorApi, preview, useMentorUi } from './mentor-api';

/** Markdown without raw HTML, images or anything that loads; links open apart (NFR-7, A05). */
const ALLOWED = [
  'p',
  'strong',
  'em',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'br',
  'h3',
  'h4',
  'blockquote',
  'a',
];

export function Reply({ text }: { text: string }) {
  return (
    <Markdown
      allowedElements={ALLOWED}
      skipHtml
      unwrapDisallowed
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}

const SUGGESTIONS = [
  'Por onde eu começo?',
  'O que está saturando?',
  'Qual o trade-off de usar cache aqui?',
];

const PROVIDER_LABEL: Record<MentorProviderId, string> = {
  subscription: 'Assinatura do Claude',
  api: 'API key',
};

const PROVIDER_KEY = 'archsim:mentor:provider';

function errorText(code: MentorErrorCode, provider: MentorProviderId, other: boolean): string {
  switch (code) {
    case 'auth':
      return provider === 'api'
        ? `A API recusou a credencial (ANTHROPIC_API_KEY inválida ou sem acesso).${other ? ' Você pode trocar para a assinatura.' : ''}`
        : `O login do Claude não funcionou: rode \`claude\` no terminal e faça login de novo.${other ? ' Você pode trocar para a API key.' : ''}`;
    case 'rate_limit':
    case 'overloaded':
      return 'O provedor está limitando ou sobrecarregado; tente de novo em instantes.';
    case 'network':
      return 'A conexão caiu no meio da resposta.';
    case 'timeout':
      return 'A resposta parou de chegar.';
    case 'refusal':
      return 'O mentor não respondeu a essa pergunta.';
    case 'unknown':
      return 'Algo deu errado com o provedor.';
  }
}

function readProvider(): MentorProviderId | null {
  try {
    const v = browserStorage()?.getItem(PROVIDER_KEY);
    return v === 'api' || v === 'subscription' ? v : null;
  } catch {
    return null;
  }
}

function storeProvider(p: MentorProviderId) {
  try {
    browserStorage()?.setItem(PROVIDER_KEY, p);
  } catch {
    // blocked storage: the choice lasts until reload
  }
}

interface Live {
  question: string;
  text: string;
  provider: MentorProviderId;
}

/**
 * The study-mode mentor: pick a provider, ask about the diagram on screen,
 * read the reply as it streams, stop it, start over (study-mode FR-3–FR-15).
 */
export function ChatPanel({ problemId }: { problemId: string }) {
  const [status, setStatus] = useState<MentorStatus | null>(null);
  const [chosen, setChosen] = useState<MentorProviderId | null>(readProvider);
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [failure, setFailure] = useState<{ text: string; question: string } | null>(null);
  const [trimmed, setTrimmed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const setUi = useMentorUi((s) => s.set);

  useEffect(() => {
    mentorApi.status().then(setStatus, () => {
      setStatus({ subscription: false, api: false, model: '' });
    });
    mentorApi.conversation(problemId).then(
      (c) => {
        setMessages(c.messages);
      },
      () => {
        setMessages([]);
      },
    );
    return () => {
      controller.current?.abort();
      setUi({ streaming: false });
    };
  }, [problemId, setUi]);

  const available = (p: MentorProviderId) => status?.[p] ?? false;
  const provider: MentorProviderId | null =
    chosen !== null && available(chosen)
      ? chosen
      : available('subscription')
        ? 'subscription'
        : available('api')
          ? 'api'
          : null;
  const busy = live !== null;

  const send = (question: string) => {
    const text = question.trim();
    if (text === '' || provider === null || busy) return;
    setFailure(null);
    setTrimmed(false);
    setDraft('');
    const c = new AbortController();
    controller.current = c;
    let reply = '';
    let usage: MentorUsage | undefined;
    let error: MentorErrorCode | null = null;
    let interrupted = false;
    setLive({ question: text, text: '', provider });
    setUi({ streaming: true, unread: null });

    const finish = () => {
      controller.current = null;
      setLive(null);
      setUi({ streaming: false });
      const at = new Date().toISOString();
      if (reply.length > 0) {
        setMessages((m) => [
          ...m,
          { role: 'user', text, at },
          {
            role: 'mentor',
            text: reply,
            at,
            provider,
            ...(interrupted ? { interrupted: true as const } : {}),
            ...(usage === undefined ? {} : { usage }),
          },
        ]);
        if (useLayout.getState().collapsed.chat) setUi({ unread: preview(reply) });
      } else {
        setDraft(text);
      }
      if (error !== null) {
        setFailure({
          text: errorText(error, provider, available(provider === 'api' ? 'subscription' : 'api')),
          question: text,
        });
      }
    };

    mentorApi
      .chat(
        { problemId, provider, message: text, diagram: useDiagram.getState().diagram },
        c.signal,
        (e) => {
          if (e.type === 'delta') {
            reply += e.text;
            setLive({ question: text, text: reply, provider });
          } else if (e.type === 'usage') usage = e.usage;
          else if (e.type === 'trimmed') setTrimmed(true);
          else if (e.type === 'error') error = e.code;
          else if (e.type === 'done') interrupted = e.interrupted;
        },
      )
      .then(
        () => {
          if (c.signal.aborted) interrupted = true;
          finish();
        },
        (e: unknown) => {
          reply = '';
          finish();
          setFailure({
            text: e instanceof ApiError ? e.message : 'não consegui falar com o mentor',
            question: text,
          });
        },
      );
  };

  const stop = () => {
    controller.current?.abort();
  };

  const spent = messages.reduce(
    (sum, m) => (m.role === 'mentor' && m.provider === 'api' ? sum + (m.usage?.costUsd ?? 0) : sum),
    0,
  );
  const tokens = messages.reduce(
    (sum, m) =>
      m.role === 'mentor' && m.usage ? sum + m.usage.inputTokens + m.usage.outputTokens : sum,
    0,
  );

  let usageLine: ReactNode = null;
  if (provider === 'api' && tokens > 0)
    usageLine = (
      <p className="chat-usage muted num">
        Esta conversa: {tokens.toLocaleString('pt-BR')} tokens · ≈ US${' '}
        {spent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
      </p>
    );
  else if (provider === 'subscription')
    usageLine = <p className="chat-usage muted">Incluído na sua assinatura do Claude.</p>;

  return (
    <section className="chat-panel" aria-label="Mentor">
      <header className="chat-head">
        <h2>Mentor</h2>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            useLayout.getState().toggle('chat');
            requestAnimationFrame(() => document.getElementById('mentor-launcher')?.focus());
          }}
        >
          Fechar
        </button>
      </header>

      <fieldset className="chat-provider" disabled={busy}>
        <legend>Provedor</legend>
        {(['subscription', 'api'] as const).map((p) => (
          <label key={p}>
            <input
              type="radio"
              name="mentor-provider"
              value={p}
              checked={provider === p}
              disabled={!available(p)}
              onChange={() => {
                setChosen(p);
                storeProvider(p);
              }}
            />
            {PROVIDER_LABEL[p]}{' '}
            <span className="muted">
              {status === null ? '…' : available(p) ? 'disponível' : 'não configurada'}
            </span>
          </label>
        ))}
      </fieldset>

      {status !== null && provider === null && (
        <div className="chat-setup" role="note">
          <p>Nenhum provedor disponível. Para conversar com o mentor:</p>
          <ul>
            <li>
              <strong>Assinatura:</strong> instale o Claude Code e faça login (<code>claude</code>{' '}
              no terminal).
            </li>
            <li>
              <strong>API:</strong> rode o app com <code>ANTHROPIC_API_KEY</code> no ambiente do{' '}
              <code>pnpm dev</code>.
            </li>
          </ul>
        </div>
      )}

      <div className="chat-log" role="log" aria-live="polite" aria-label="Conversa com o mentor">
        {messages.length === 0 && !live && (
          <div className="chat-empty">
            <p className="muted">
              Pergunte sobre o desenho que está na tela: o mentor vê os nós, os números da
              simulação, o enunciado e a solução de referência.
            </p>
            <ul className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className="button"
                    disabled={provider === null}
                    onClick={() => {
                      send(s);
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={`${String(i)}-u`} className="chat-msg chat-user">
              {m.text}
            </p>
          ) : (
            <div key={`${String(i)}-m`} className="chat-msg chat-mentor">
              <Reply text={m.text} />
              {m.interrupted && <p className="chat-note muted">resposta interrompida</p>}
            </div>
          ),
        )}
        {live && (
          <>
            <p className="chat-msg chat-user">{live.question}</p>
            <div className="chat-msg chat-mentor">
              {live.text === '' ? (
                <p className="muted chat-thinking">pensando…</p>
              ) : (
                <Reply text={live.text} />
              )}
            </div>
          </>
        )}
      </div>

      {trimmed && (
        <p className="chat-note muted" role="status">
          O início da conversa ficou de fora do contexto.
        </p>
      )}
      {failure && (
        <div className="chat-error" role="alert">
          <p>{failure.text}</p>
          <button
            type="button"
            className="button"
            disabled={provider === null}
            onClick={() => {
              send(failure.question);
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) stop();
          else send(draft);
        }}
      >
        <label htmlFor="mentor-input" className="sr-only">
          Pergunta para o mentor
        </label>
        <textarea
          id="mentor-input"
          ref={input}
          rows={3}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={provider === null ? 'Configure um provedor' : 'Pergunte ao mentor…'}
          disabled={provider === null}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy) send(draft);
            }
          }}
        />
        <div className="chat-actions">
          <span className="muted num chat-count">
            {draft.length}/{MAX_MESSAGE_CHARS}
          </span>
          {usageLine}
          <button type="submit" className="button primary" disabled={provider === null}>
            {busy ? 'Parar' : 'Enviar'}
          </button>
        </div>
      </form>

      {messages.length > 0 &&
        !busy &&
        (confirmClear ? (
          <div className="chat-clear" role="group" aria-label="Apagar a conversa?">
            <span>Apagar a conversa deste problema?</span>
            <button
              type="button"
              className="button"
              onClick={() => {
                setConfirmClear(false);
                mentorApi.clear(problemId).then(
                  () => {
                    setMessages([]);
                  },
                  (e: unknown) => {
                    setFailure({
                      text: e instanceof ApiError ? e.message : 'não consegui apagar a conversa',
                      question: '',
                    });
                  },
                );
              }}
            >
              Apagar
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setConfirmClear(false);
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="link-button chat-new"
            onClick={() => {
              setConfirmClear(true);
            }}
          >
            Nova conversa
          </button>
        ))}
    </section>
  );
}
