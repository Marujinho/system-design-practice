import { catalog } from '@archsim/catalog';
import {
  scoreAttempt,
  toPublic,
  withProblemLoad,
  type FinalizeResponse,
  type ProblemSummary,
} from '@archsim/problems';
import { loadProblem, PROBLEMS_DIR } from '@archsim/problems/load';
import { initialState, step } from '@archsim/sim-engine';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineBackend } from '../sim/sim-client';
import { setBackendFactory, useSim } from '../sim/sim-store';
import { useDiagram } from '../store/diagram-store';
import { EXPANDED, useLayout } from '../workspace/layout-store';
import { EvaluationPanel } from './EvaluationPanel';
import { ProblemList, statusOf } from './ProblemList';
import { ProblemView } from './ProblemView';
import { ResultScreen } from './ResultScreen';

const loaded = (() => {
  const r = loadProblem(join(PROBLEMS_DIR, 'url-shortener'));
  if (!r.ok) throw new Error(r.message);
  return r.value;
})();

const referenceLabels = loaded.reference.nodes
  .map((n) => n.label)
  .filter((l) => l.length > 6 && l !== 'Usuários');

class Observer {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function summary(over: Partial<ProblemSummary> = {}): ProblemSummary {
  return {
    id: 'url-shortener',
    title: 'Encurtador de URL',
    difficulty: 'facil',
    record: null,
    stars: null,
    attempts: 0,
    solutionAvailable: false,
    ...over,
  };
}

function finalizeAnswer(over: Partial<FinalizeResponse> = {}): FinalizeResponse {
  const s = scoreAttempt({
    problem: loaded.problem,
    reference: loaded.reference,
    diagram: loaded.reference,
    catalog,
    ticks: 50,
  });
  return {
    problemId: 'url-shortener',
    score: {
      total: s.total,
      stars: s.stars,
      parts: s.parts,
      allPass: s.allPass,
      passAt15: s.passAt15,
      passAt2: s.passAt2,
      userCost: s.userCost,
      referenceCost: s.referenceCost,
      belowReference: s.belowReference,
      solutionSeen: false,
    },
    requirements: s.requirements,
    findings: s.findings,
    isRecord: true,
    previousRecord: null,
    ...over,
  };
}

type Route = (url: string, init?: RequestInit) => unknown;

function mockFetch(route: Route) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const body = route(url, init);
    const status = body === undefined ? 404 : 200;
    return Promise.resolve(
      new Response(JSON.stringify(body ?? { error: 'não encontrado' }), { status }),
    );
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  setBackendFactory(inlineBackend);
  localStorage.clear();
});

afterEach(() => {
  useSim.getState().stop();
  vi.unstubAllGlobals();
});

describe('ProblemList (FR-43)', () => {
  it('derives the status', () => {
    expect(statusOf(summary(), false)).toBe('não iniciado');
    expect(statusOf(summary(), true)).toBe('em andamento');
    expect(statusOf(summary({ attempts: 2 }), false)).toBe('finalizado');
  });

  it('shows title, difficulty, status, record and stars', async () => {
    mockFetch((url) =>
      url.endsWith('/problems') ? [summary({ attempts: 3, record: 85, stars: 2 })] : undefined,
    );
    render(<ProblemList />);
    const card = await screen.findByRole('link', { name: /Encurtador de URL/ });
    expect(within(card).getByText('fácil')).toBeTruthy();
    expect(within(card).getByText('finalizado')).toBeTruthy();
    expect(within(card).getByText(/recorde 85/)).toBeTruthy();
    expect(within(card).getByLabelText('2 de 3 estrelas').textContent).toBe('★★☆');
  });

  it('explains when the local server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    render(<ProblemList />);
    expect((await screen.findByText(/servidor local não respondeu/)).textContent).toBeTruthy();
  });
});

describe('ProblemView (FR-44, FR-46, A05)', () => {
  function routes(solutionAvailable: boolean, statement = loaded.problem.statement): Route {
    return (url, init) => {
      if (url.endsWith('/problems/url-shortener'))
        return { ...toPublic(loaded.problem), statement };
      if (url.endsWith('/problems'))
        return [summary({ solutionAvailable, attempts: solutionAvailable ? 1 : 0 })];
      if (url.endsWith('/finalize') && init?.method === 'POST') return finalizeAnswer();
      if (url.endsWith('/reference/url-shortener'))
        return withProblemLoad(loaded.reference, loaded.problem);
      return undefined;
    };
  }

  it('shows only the statement: no hint, no reference node, the load locked, no solution button', async () => {
    mockFetch(routes(false));
    const { container } = render(<ProblemView problemId="url-shortener" />);
    await screen.findByText('Encurtador de URL');
    await screen.findByText('Carga definida pelo problema.');
    for (const label of referenceLabels) expect(container.textContent).not.toContain(label);
    expect(screen.queryByRole('button', { name: 'Ver uma solução' })).toBeNull();
    expect(useDiagram.getState().diagram.nodes.map((n) => n.id)).toEqual(['users']);
    expect(useDiagram.getState().diagram.load).toEqual(loaded.problem.load);
  });

  it('renders a statement with <script> as text, never as an element', async () => {
    mockFetch(
      routes(
        false,
        'Antes <script>alert(1)</script> depois, com texto suficiente para o enunciado.',
      ),
    );
    const { container } = render(<ProblemView problemId="url-shortener" />);
    await screen.findByText('Encurtador de URL');
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows the title on the collapsed top strip as text, never as an element (edge-hover FR-10, A05)', async () => {
    const title = '<script>alert(1)</script> Encurtador';
    const base = routes(false);
    mockFetch((url, init) =>
      url.endsWith('/problems/url-shortener')
        ? { ...toPublic(loaded.problem), title }
        : base(url, init),
    );
    useLayout.setState({ collapsed: { ...EXPANDED, top: true }, before: null });
    try {
      const { container } = render(<ProblemView problemId="url-shortener" />);
      const strip = await screen.findByText(title, { selector: '.collapsible-top strong' });
      expect(strip.textContent).toBe(title);
      expect(container.querySelector('script')).toBeNull();
      expect(screen.getByRole('button', { name: 'Expandir barra superior' })).not.toBeNull();
    } finally {
      useLayout.setState({ collapsed: { ...EXPANDED }, before: null });
    }
  });

  it('finalizes, shows the result, then opens the solution without touching the user diagram', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(routes(false));
    render(<ProblemView problemId="url-shortener" />);
    await screen.findByText('Encurtador de URL');
    useDiagram.getState().addNode('aws.ec2', { x: 200, y: 0 });
    const before = structuredClone(useDiagram.getState().diagram);

    await user.click(screen.getByRole('button', { name: 'Finalizar e pontuar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resultado' });
    expect(within(dialog).getByText('novo recorde')).toBeTruthy();
    const post = fetchMock.mock.calls.find(([u]) => u.endsWith('/finalize'));
    expect(JSON.parse(typeof post?.[1]?.body === 'string' ? post[1].body : '')).toEqual({
      problemId: 'url-shortener',
      diagram: before,
    });

    await user.click(within(dialog).getByRole('button', { name: 'Ver uma solução' }));
    const solution = await screen.findByRole('dialog', { name: /Uma solução/ });
    expect(solution.textContent).toContain('API de redirecionamento');
    expect(useDiagram.getState().diagram).toEqual(before);
  });

  it('offers the solution from the start when the problem was already finalized', async () => {
    mockFetch(routes(true));
    render(<ProblemView problemId="url-shortener" />);
    expect(await screen.findByRole('button', { name: 'Ver uma solução' })).toBeTruthy();
  });

  it('says why the session could not be saved', async () => {
    const user = userEvent.setup();
    mockFetch((url, init) =>
      url.endsWith('/finalize') && init?.method === 'POST' ? undefined : routes(false)(url, init),
    );
    render(<ProblemView problemId="url-shortener" />);
    await screen.findByText('Encurtador de URL');
    await user.click(screen.getByRole('button', { name: 'Finalizar e pontuar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Não consegui gravar a sessão: não encontrado/,
    );
  });
});

describe('EvaluationPanel (FR-45)', () => {
  it('turns the p99 requirement red when the cache is removed', () => {
    const run = (d: typeof loaded.reference) => {
      const r = step(initialState(), withProblemLoad(d, loaded.problem), catalog, 100).result;
      useSim.setState({ result: r, status: 'running' });
    };
    run(loaded.reference);
    const { rerender } = render(
      <EvaluationPanel
        requirements={loaded.problem.quantitative}
        onFinalize={vi.fn()}
        busy={false}
        error={null}
      />,
    );
    const p99 = () => screen.getByText('p99 do redirecionamento').closest('li');
    expect(p99()?.className).toBe('pass');
    const noCache = {
      ...loaded.reference,
      nodes: loaded.reference.nodes.filter((n) => n.id !== 'cache'),
      edges: [
        ...loaded.reference.edges.filter((e) => e.source !== 'cache' && e.target !== 'cache'),
        {
          id: 'app-db-r',
          source: 'app',
          target: 'db',
          protocol: 'tcp' as const,
          classes: ['redirect'],
        },
      ],
    };
    run(noCache);
    rerender(
      <EvaluationPanel
        requirements={loaded.problem.quantitative}
        onFinalize={vi.fn()}
        busy={false}
        error={null}
      />,
    );
    expect(p99()?.className).toBe('fail');
    expect(screen.getByText(/Custo atual: US\$/)).toBeTruthy();
  });
});

describe('ResultScreen (FR-58)', () => {
  it('lands the score at once under reduced motion, with stars, parts and the reference only as a number', () => {
    const answer = finalizeAnswer();
    render(<ResultScreen result={answer} onClose={vi.fn()} onSolution={vi.fn()} />);
    expect(screen.getByLabelText(`Score ${answer.score.total} de 100`).textContent).toContain(
      String(answer.score.total),
    );
    expect(screen.getByLabelText('3 de 3 estrelas')).toBeTruthy();
    expect(screen.getByText('novo recorde')).toBeTruthy();
    expect(screen.getByText(/Seu custo × referência/)).toBeTruthy();
    for (const label of referenceLabels) expect(document.body.textContent).not.toContain(label);
  });

  it('marks an attempt made after seeing the solution', () => {
    const answer = finalizeAnswer({ isRecord: false });
    answer.score.solutionSeen = true;
    render(<ResultScreen result={answer} onClose={vi.fn()} onSolution={vi.fn()} />);
    expect(screen.queryByText('novo recorde')).toBeNull();
    expect(screen.getByText(/não conta para o recorde/)).toBeTruthy();
  });

  it('tells the user what to ask the agent and lets them copy it (FR-48)', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ResultScreen result={finalizeAnswer()} onClose={vi.fn()} onSolution={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Copiar frase para o agente' }));
    expect(writeText).toHaveBeenCalledWith('Pode começar os follow-ups do ArchSim');
    expect(
      screen.getByText('pnpm -s archsim simulate --session practice/session.json'),
    ).toBeTruthy();
  });
});
