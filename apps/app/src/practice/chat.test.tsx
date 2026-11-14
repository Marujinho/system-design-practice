import type { Conversation, MentorEvent, MentorStatus, Proposal } from '@archsim/problems';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineBackend } from '../sim/sim-client';
import { setBackendFactory, useSim } from '../sim/sim-store';
import { emptyDiagram, problemStart } from '../store/defaults';
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
    if (url.endsWith('/proposal'))
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

describe('proposals in the chat (mentor-edits FR-3–FR-9, NFR-2, A05)', () => {
  const PID = '0b6c1f9e-6b1a-4a5f-9a7e-0c2b1d3e4f50';
  const proposal = (over: Partial<Proposal> = {}): Proposal => ({
    summary: 'API atrás dos Usuários',
    ops: [
      { op: 'add', ref: 'novo1', service: 'aws.ec2', label: 'API' },
      { op: 'connect', from: 'users', to: 'novo1' },
    ],
    id: PID,
    status: 'pending',
    ...over,
  });
  const withProposal = (p: Proposal): Conversation => ({
    ...empty,
    messages: [
      { role: 'user', text: 'põe uma API', at: '2026-11-14T12:00:00.000Z' },
      {
        role: 'mentor',
        text: 'Proponho.',
        at: '2026-11-14T12:00:00.000Z',
        provider: 'api',
        proposal: p,
      },
    ],
  });
  const statusCalls = (fetch: ReturnType<typeof mockFetch>) =>
    fetch.mock.calls
      .filter(([u]) => u.endsWith('/proposal'))
      .map(
        ([, i]) => JSON.parse(typeof i?.body === 'string' ? i.body : '{}') as { status: string },
      );

  beforeEach(() => {
    useDiagram
      .getState()
      .start({ kind: 'study', problemId: 'url-shortener' }, problemStart(emptyDiagram().load));
  });

  it('shows what changes, in the names on screen, and changes nothing until Aplicar', async () => {
    mockFetch({ conversation: withProposal(proposal()) });
    render(<ChatPanel problemId="url-shortener" />);
    const card = await screen.findByRole('region', { name: 'Proposta do mentor' });
    expect(within(card).getByText("+ EC2 'API'")).toBeTruthy();
    expect(within(card).getByText("+ conexão 'Usuários' → 'API' (novo)")).toBeTruthy();
    expect(useDiagram.getState().diagram.nodes).toHaveLength(1);
  });

  it('applies everything as one undo step, and Desfazer goes back exactly', async () => {
    const fetch = mockFetch({ conversation: withProposal(proposal()) });
    render(<ChatPanel problemId="url-shortener" />);
    const before = useDiagram.getState().diagram;
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));
    const after = useDiagram.getState().diagram;
    const api = after.nodes.find((n) => n.label === 'API');
    expect(api?.serviceId).toBe('aws.ec2');
    expect(after.edges.some((e) => e.source === 'users' && e.target === api?.id)).toBe(true);
    expect(useDiagram.getState().history.past.at(-1)).toBe(before);
    expect(screen.getByText('aplicada')).toBeTruthy();
    expect(statusCalls(fetch).map((c) => c.status)).toEqual(['applied']);
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(useDiagram.getState().diagram).toBe(before);
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeTruthy();
    expect(statusCalls(fetch).map((c) => c.status)).toEqual(['applied', 'pending']);
  });

  it('goes back to pending when Ctrl+Z undoes it, so it can be applied again', async () => {
    const fetch = mockFetch({ conversation: withProposal(proposal()) });
    render(<ChatPanel problemId="url-shortener" />);
    const before = useDiagram.getState().diagram;
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));
    act(() => {
      useDiagram.getState().undo();
    });
    expect(useDiagram.getState().diagram).toBe(before);
    expect(await screen.findByRole('button', { name: 'Aplicar' })).toBeTruthy();
    expect(screen.getByText('proposta')).toBeTruthy();
    expect(statusCalls(fetch).map((c) => c.status)).toEqual(['applied', 'pending']);
  });

  it('hides Desfazer once something else changes the diagram', async () => {
    mockFetch({ conversation: withProposal(proposal()) });
    render(<ChatPanel problemId="url-shortener" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy();
    act(() => {
      useDiagram.getState().setLabel('users', 'Clientes');
    });
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });

  it('discards without touching the diagram', async () => {
    const fetch = mockFetch({ conversation: withProposal(proposal()) });
    render(<ChatPanel problemId="url-shortener" />);
    const before = useDiagram.getState().diagram;
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(useDiagram.getState().diagram).toBe(before);
    expect(screen.getByText('descartada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull();
    expect(statusCalls(fetch).map((c) => c.status)).toEqual(['discarded']);
  });

  it('refuses a proposal whose nodes are gone, and leaves the diagram as it is', async () => {
    mockFetch({
      conversation: withProposal(
        proposal({ ops: [{ op: 'set_prop', node: 'app-gone', key: 'units', value: 2 }] }),
      ),
    });
    render(<ChatPanel problemId="url-shortener" />);
    const before = useDiagram.getState().diagram;
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));
    expect(useDiagram.getState().diagram).toBe(before);
    expect(screen.getByRole('status').textContent).toContain('O desenho mudou desde esta proposta');
  });

  it('keeps the state it had after a reload', async () => {
    mockFetch({ conversation: withProposal(proposal({ status: 'applied' })) });
    render(<ChatPanel problemId="url-shortener" />);
    expect(await screen.findByText('aplicada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull();
  });

  it('shows a proposal that arrives in a reply, and warns about a rejected one', async () => {
    mockFetch({
      chat: (_b, s) =>
        streamed([
          { type: 'start' },
          { type: 'delta', text: 'Proponho.' },
          { type: 'proposal', proposal: proposal() },
          { type: 'proposal_rejected', reason: 'x' },
          { type: 'done', interrupted: false },
        ])(s),
    });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'põe uma API{Enter}');
    expect(await screen.findByRole('region', { name: 'Proposta do mentor' })).toBeTruthy();
    // a proposal made it: the extra rejected one is not worth a warning (review L6)
    expect(screen.queryByText(/O mentor propôs uma mudança que o simulador não aceita/)).toBeNull();
  });

  it('warns when the only proposal of a reply was rejected', async () => {
    mockFetch({
      chat: (_b, s) =>
        streamed([
          { type: 'start' },
          { type: 'delta', text: 'Tentei.' },
          { type: 'proposal_rejected', reason: 'x' },
          { type: 'done', interrupted: false },
        ])(s),
    });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'põe uma API{Enter}');
    expect(
      await screen.findByText(/O mentor propôs uma mudança que o simulador não aceita/),
    ).toBeTruthy();
  });

  it('keeps no proposal from a stream that ended without done (review L1)', async () => {
    mockFetch({
      chat: (_b, s) =>
        streamed([
          { type: 'start' },
          { type: 'delta', text: 'Proponho.' },
          { type: 'proposal', proposal: proposal() },
        ])(s),
    });
    render(<ChatPanel problemId="url-shortener" />);
    const box = await screen.findByRole('textbox', { name: 'Pergunta para o mentor' });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    await userEvent.type(box, 'põe uma API{Enter}');
    expect(await screen.findByText('resposta interrompida')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Proposta do mentor' })).toBeNull();
  });

  it('follows a redo after an undo, and never applies the same proposal twice (review M1)', async () => {
    mockFetch({ conversation: withProposal(proposal()) });
    render(<ChatPanel problemId="url-shortener" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));
    act(() => {
      useDiagram.getState().undo();
    });
    expect(await screen.findByRole('button', { name: 'Aplicar' })).toBeTruthy();
    act(() => {
      useDiagram.getState().redo();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull();
    });
    expect(screen.getByText('aplicada')).toBeTruthy();
    expect(useDiagram.getState().diagram.nodes.filter((n) => n.label === 'API')).toHaveLength(1);
  });

  it('holds the buttons while the mentor replies, and saves a refused status once it ends (review M2)', async () => {
    let refuse = false;
    const bodies: string[] = [];
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/mentor/status'))
        return Promise.resolve(new Response(JSON.stringify(BOTH)));
      if (url.endsWith('/proposal')) {
        bodies.push(typeof init?.body === 'string' ? init.body : '');
        return Promise.resolve(
          refuse
            ? new Response(JSON.stringify({ error: 'já há uma resposta em andamento' }), {
                status: 409,
              })
            : new Response(JSON.stringify(withProposal(proposal()))),
        );
      }
      if (url.includes('/conversation/'))
        return Promise.resolve(new Response(JSON.stringify(withProposal(proposal()))));
      return Promise.resolve(new Response('{}', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetch);
    render(<ChatPanel problemId="url-shortener" />);
    const applyButton = await screen.findByRole('button', { name: 'Aplicar' });
    act(() => {
      useMentorUi.setState({ streaming: true });
    });
    expect(applyButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
    act(() => {
      useMentorUi.setState({ streaming: false });
    });
    await userEvent.click(applyButton);
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    // Ctrl+Z while a reply streams: the server refuses (409) and the card waits for the end
    refuse = true;
    act(() => {
      useMentorUi.setState({ streaming: true });
      useDiagram.getState().undo();
    });
    await waitFor(() => {
      expect(bodies).toHaveLength(2);
    });
    refuse = false;
    act(() => {
      useMentorUi.setState({ streaming: false });
    });
    await waitFor(() => {
      expect(bodies).toHaveLength(3);
    });
    expect(JSON.parse(bodies[2] ?? '{}')).toMatchObject({ status: 'pending' });
  });

  it('never renders markup from a proposal: one with tags does not even load', async () => {
    const bad = withProposal(proposal({ summary: '<img src=x onerror=alert(1)>' }));
    const evil = {
      ...bad,
      messages: bad.messages.map((m) =>
        m.role === 'mentor' && m.proposal
          ? {
              ...m,
              proposal: {
                ...m.proposal,
                ops: [{ op: 'rename', node: 'users', label: '<b>x</b>' }],
              },
            }
          : m,
      ),
    };
    mockFetch({ conversation: evil as Conversation });
    const { container } = render(<ChatPanel problemId="url-shortener" />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Pergunta para o mentor' })).toBeEnabled();
    });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Proposta do mentor' })).toBeNull();
  });

  it('applies from the keyboard', async () => {
    mockFetch({ conversation: withProposal(proposal()) });
    render(<ChatPanel problemId="url-shortener" />);
    const apply = await screen.findByRole('button', { name: 'Aplicar' });
    apply.focus();
    await userEvent.keyboard('{Enter}');
    expect(useDiagram.getState().diagram.nodes.some((n) => n.label === 'API')).toBe(true);
  });
});
