import type { Conversation, MentorEvent, MentorStatus } from '@archsim/problems';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineBackend } from '../sim/sim-client';
import { setBackendFactory, useSim } from '../sim/sim-store';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { EXPANDED, useLayout } from '../workspace/layout-store';
import { Workspace } from '../workspace/Workspace';
import { ChatPanel } from './ChatPanel';
import { preview, sseData, useMentorUi } from './mentor-api';
import { MentorLauncher } from './MentorLauncher';

class Observer {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const BOTH: MentorStatus = { subscription: true, api: true, model: 'claude-opus-5-5' };
const empty: Conversation = { schemaVersion: 1, problemId: 'url-shortener', messages: [] };

const sse = (events: MentorEvent[]) =>
  events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

/** A chat reply that arrives in pieces; `hold` keeps the stream open until aborted. */
function streamed(events: MentorEvent[], hold = false) {
  const enc = new TextEncoder();
  return (signal?: AbortSignal | null) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const e of events) c.enqueue(enc.encode(sse([e])));
          if (!hold) c.close();
          signal?.addEventListener('abort', () => {
            c.error(new DOMException('aborted', 'AbortError'));
          });
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
}

interface Routes {
  status?: MentorStatus;
  conversation?: Conversation;
  chat?: (body: Record<string, unknown>, signal?: AbortSignal | null) => Response;
}

function mockFetch(r: Routes) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/mentor/status'))
      return Promise.resolve(new Response(JSON.stringify(r.status ?? BOTH)));
    if (url.includes('/conversation/') && init?.method === 'DELETE')
      return Promise.resolve(new Response(null, { status: 204 }));
    if (url.includes('/conversation/'))
      return Promise.resolve(new Response(JSON.stringify(r.conversation ?? empty)));
    if (url.endsWith('/chat') && r.chat) {
      const raw = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(raw) as Record<string, unknown>;
      return Promise.resolve(r.chat(body, init?.signal));
    }
    return Promise.resolve(new Response(JSON.stringify({ error: 'x' }), { status: 404 }));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  setBackendFactory(inlineBackend);
  localStorage.clear();
  useLayout.setState({ collapsed: { ...EXPANDED, chat: false }, before: null });
  useMentorUi.setState({ streaming: false, unread: null });
  useDiagram.getState().start({ kind: 'study', problemId: 'url-shortener' }, emptyDiagram());
});

afterEach(() => {
  useSim.getState().stop();
  vi.unstubAllGlobals();
});

const ok = (text: string[]): MentorEvent[] => [
  { type: 'start' },
  ...text.map((t) => ({ type: 'delta' as const, text: t })),
  { type: 'usage', usage: { inputTokens: 1000, outputTokens: 50, costUsd: 0.005 } },
  { type: 'done', interrupted: false },
];

describe('ChatPanel (study-mode FR-6, FR-7, FR-13, FR-14, FR-15)', () => {
  it('asks with the diagram on screen and shows the reply as it streams', async () => {
    let sent: Record<string, unknown> = {};
    mockFetch({
      chat: (body, signal) => {
        sent = body;
        return streamed(ok(['O RDS ', 'está a **140%**.']))(signal);
      },
    });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'O que está saturando?{Enter}');
    const log = screen.getByRole('log', { name: 'Conversa com o mentor' });
    expect(await within(log).findByText('140%')).toBeTruthy();
    expect(within(log).getByText('O que está saturando?')).toBeTruthy();
    expect(sent).toMatchObject({
      problemId: 'url-shortener',
      provider: 'subscription',
      message: 'O que está saturando?',
    });
    expect(sent.diagram).toEqual(useDiagram.getState().diagram);
    expect(screen.getByText('Incluído na sua assinatura do Claude.')).toBeTruthy();
  });

  it('keeps Shift+Enter as a new line', async () => {
    const fetch = mockFetch({ chat: (_b, s) => streamed(ok(['x']))(s) });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'linha 1{Shift>}{Enter}{/Shift}linha 2');
    expect((box as HTMLTextAreaElement).value).toBe('linha 1\nlinha 2');
    expect(fetch.mock.calls.some(([u]) => u.endsWith('/chat'))).toBe(false);
  });

  it('stops a reply and keeps what arrived, marked interrupted', async () => {
    let aborted = false;
    mockFetch({
      chat: (_b, signal) => {
        signal?.addEventListener('abort', () => (aborted = true));
        return streamed(
          [{ type: 'start' }, { type: 'delta', text: 'Começando a pensar' }],
          true,
        )(signal);
      },
    });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'lento{Enter}');
    await screen.findByText('Começando a pensar');
    expect(useMentorUi.getState().streaming).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(await screen.findByText('resposta interrompida')).toBeTruthy();
    expect(aborted).toBe(true);
    expect(useMentorUi.getState().streaming).toBe(false);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy();
  });

  it('explains a credential error, puts the question back and offers to retry', async () => {
    mockFetch({
      chat: (_b, s) =>
        streamed([
          { type: 'start' },
          { type: 'error', code: 'auth' },
          { type: 'done', interrupted: false },
        ])(s),
    });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'Por que?{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('login do Claude');
    expect(alert.textContent).toContain('trocar para a API key');
    expect((box as HTMLTextAreaElement).value).toBe('Por que?');
    expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });

  it('says when the start of the conversation was left out', async () => {
    mockFetch({
      chat: (_b, s) =>
        streamed([{ type: 'start' }, { type: 'trimmed' }, ...ok(['ok']).slice(1)])(s),
    });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'oi{Enter}');
    expect(await screen.findByText('O início da conversa ficou de fora do contexto.')).toBeTruthy();
  });

  it('shows which providers are available and the API usage', async () => {
    mockFetch({
      status: { subscription: false, api: true, model: 'm' },
      chat: (_b, s) => streamed(ok(['resposta']))(s),
    });
    render(<ChatPanel problemId="url-shortener" />);
    const group = screen.getByRole('group', { name: 'Provedor' });
    const sub = await within(group).findByRole('radio', { name: /Assinatura do Claude/ });
    await waitFor(() => {
      expect(sub).toBeDisabled();
    });
    expect(within(group).getByRole('radio', { name: /API key/ })).toBeChecked();
    expect(group.textContent).toContain('não configurada');
    await userEvent.click(screen.getByRole('button', { name: 'Por onde eu começo?' }));
    expect(await screen.findByText(/1\.050 tokens/)).toBeTruthy();
  });

  it('disables the question and explains the setup when no provider can answer', async () => {
    mockFetch({ status: { subscription: false, api: false, model: 'm' } });
    render(<ChatPanel problemId="url-shortener" />);
    expect((await screen.findByRole('note')).textContent).toContain('ANTHROPIC_API_KEY');
    expect(screen.getByRole('textbox', { name: 'Pergunta para o mentor' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Por onde eu começo?' })).toBeDisabled();
  });

  it('clears the conversation only after confirming', async () => {
    const fetch = mockFetch({
      conversation: {
        ...empty,
        messages: [
          { role: 'user', text: 'oi', at: '2026-11-14T12:00:00.000Z' },
          { role: 'mentor', text: 'olá', at: '2026-11-14T12:00:00.000Z', provider: 'api' },
        ],
      },
    });
    render(<ChatPanel problemId="url-shortener" />);
    await screen.findByText('olá');
    await userEvent.click(screen.getByRole('button', { name: 'Nova conversa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('olá')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Nova conversa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    await waitFor(() => {
      expect(screen.queryByText('olá')).toBeNull();
    });
    expect(fetch.mock.calls.filter(([, i]) => i?.method === 'DELETE')).toHaveLength(1);
  });
});

describe('mentor replies are text, never markup (NFR-7, A05)', () => {
  it('renders HTML as text and opens links apart', async () => {
    mockFetch({
      conversation: {
        ...empty,
        messages: [
          { role: 'user', text: 'oi', at: '2026-11-14T12:00:00.000Z' },
          {
            role: 'mentor',
            text: 'Veja <img src=x onerror=alert(1)> e <script>alert(2)</script> e [a doc](https://docs.aws.amazon.com/) e ![x](https://evil.example/x.png)',
            at: '2026-11-14T12:00:00.000Z',
            provider: 'api',
          },
        ],
      },
    });
    const { container } = render(<ChatPanel problemId="url-shortener" />);
    const link = await screen.findByRole('link', { name: 'a doc' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('the floating launcher (study-mode FR-3)', () => {
  function renderStudy() {
    return render(
      <Workspace
        mode={{ kind: 'study', problemId: 'url-shortener' }}
        side={<p>lateral</p>}
        chat={{ panel: <ChatPanel problemId="url-shortener" />, launcher: <MentorLauncher /> }}
      />,
    );
  }

  it('takes no column while closed, and opens a column next to the side panel', async () => {
    mockFetch({});
    useLayout.setState({ collapsed: { ...EXPANDED }, before: null });
    const { container } = renderStudy();
    const body = container.querySelector('.workspace-body');
    const launcher = screen.getByRole('button', { name: 'Abrir mentor' });
    expect(body?.classList.contains('chat-open')).toBe(false);
    expect(container.querySelector('#mentor-chat')?.hasAttribute('hidden')).toBe(true);
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(launcher);
    expect(body?.classList.contains('chat-open')).toBe(true);
    // open, the pill leaves the canvas; the panel closes itself
    expect(screen.queryByRole('button', { name: 'Abrir mentor' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(body?.classList.contains('chat-open')).toBe(false);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir mentor' })).toHaveFocus();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Abrir mentor' }));
    // the side panel is still there and usable next to the chat
    expect(screen.getByText('lateral')).toBeVisible();
  });

  it('toggles with M outside text fields, never while typing', async () => {
    mockFetch({});
    useLayout.setState({ collapsed: { ...EXPANDED }, before: null });
    renderStudy();
    await userEvent.keyboard('m');
    expect(useLayout.getState().collapsed.chat).toBe(false);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    // opening moves the focus to the question
    await waitFor(() => {
      expect(box).toHaveFocus();
    });
    await userEvent.keyboard('m');
    expect(useLayout.getState().collapsed.chat).toBe(false);
    expect((box as HTMLTextAreaElement).value).toBe('m');
    box.blur();
    await userEvent.keyboard('M');
    expect(useLayout.getState().collapsed.chat).toBe(true);
  });

  it('shows a reply that arrived while closed, and hides it on opening', async () => {
    mockFetch({});
    useLayout.setState({ collapsed: { ...EXPANDED }, before: null });
    renderStudy();
    act(() => {
      useMentorUi.setState({ unread: 'O RDS está a 140%.' });
    });
    const bubble = screen.getByRole('status');
    expect(bubble.textContent).toBe('O RDS está a 140%.');
    await userEvent.click(bubble);
    expect(useLayout.getState().collapsed.chat).toBe(false);
    expect(useMentorUi.getState().unread).toBeNull();
  });

  it('pulses while the mentor answers, unless motion is reduced', () => {
    mockFetch({});
    useLayout.setState({ collapsed: { ...EXPANDED }, before: null });
    useMentorUi.setState({ streaming: true });
    const { container, unmount } = renderStudy();
    expect(container.querySelector('.mentor-dot.pulsing')).not.toBeNull();
    unmount();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    // unmounting the panel ends its stream on purpose; a new one starts here
    useMentorUi.setState({ streaming: true });
    const again = renderStudy();
    expect(again.container.querySelector('.mentor-dot')).not.toBeNull();
    expect(again.container.querySelector('.mentor-dot.pulsing')).toBeNull();
  });
});

describe('helpers', () => {
  it('splits server-sent events and keeps an incomplete one for later', () => {
    const { events, rest } = sseData('event: delta\ndata: {"a":1}\n\nevent: delta\ndata: {"a"');
    expect(events).toEqual(['{"a":1}']);
    expect(rest).toBe('event: delta\ndata: {"a"');
  });

  it('previews the first line, without markdown, up to 120 characters', () => {
    expect(preview('\n**O RDS** está a `140%`.\nmais')).toBe('O RDS está a 140%.');
    expect(preview('x'.repeat(200))).toHaveLength(120);
  });
});
