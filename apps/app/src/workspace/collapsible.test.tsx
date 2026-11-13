import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineBackend } from '../sim/sim-client';
import { setBackendFactory, useSim } from '../sim/sim-store';
import { useDiagram } from '../store/diagram-store';
import { EXPANDED, useLayout } from './layout-store';
import { Workspace } from './Workspace';

class Observer {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
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
  useLayout.setState({ collapsed: { ...EXPANDED }, before: null });
});

afterEach(() => {
  useSim.getState().stop();
  vi.unstubAllGlobals();
});

function renderWorkspace() {
  const view = render(
    <Workspace
      mode={{ kind: 'free' }}
      side={<input aria-label="Campo lateral" />}
      top={<p>conteúdo do topo</p>}
    />,
  );
  const body = view.container.querySelector('.workspace-body');
  if (!body) throw new Error('no workspace body');
  return { ...view, body };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('collapsible panels (edge-hover FR-8–FR-10, FR-14, FR-15)', () => {
  it('collapses the palette to a strip and keeps its content mounted', async () => {
    const { body } = renderWorkspace();
    const search = screen.getByRole('searchbox', { name: 'Buscar serviço' });
    await userEvent.click(button('Recolher paleta'));
    expect(button('Expandir paleta').getAttribute('aria-expanded')).toBe('false');
    expect(body.classList).toContain('palette-collapsed');
    expect(search.isConnected).toBe(true);
    expect(search.closest('.collapsible-body')?.hasAttribute('hidden')).toBe(true);
    await userEvent.click(button('Expandir paleta'));
    expect(body.classList).not.toContain('palette-collapsed');
    expect(button('Recolher paleta').getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps what was typed in the side panel across collapse and expand', async () => {
    const { body } = renderWorkspace();
    await userEvent.type(screen.getByRole('textbox', { name: 'Campo lateral' }), 'rascunho');
    await userEvent.click(button('Recolher painel lateral'));
    expect(body.classList).toContain('side-collapsed');
    await userEvent.click(button('Expandir painel lateral'));
    expect(screen.getByRole('textbox', { name: 'Campo lateral' })).toHaveProperty(
      'value',
      'rascunho',
    );
  });

  it('flags a selection on the collapsed side strip without opening it', async () => {
    renderWorkspace();
    await userEvent.click(button('Recolher painel lateral'));
    expect(screen.queryByRole('status', { name: /Propriedades/ })).toBeNull();
    act(() => {
      const id = useDiagram.getState().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
      useDiagram.getState().select([id]);
    });
    expect(
      screen.getByRole('status', { name: 'Propriedades — 1 item selecionado' }),
    ).not.toBeNull();
    expect(useLayout.getState().collapsed.side).toBe(true);
  });

  it('folds the top bar to a one-line strip with its summary', async () => {
    renderWorkspace();
    const content = screen.getByText('conteúdo do topo');
    expect(screen.queryByText('Carga')).toBeNull();
    await userEvent.click(button('Recolher barra superior'));
    expect(screen.getByText('Carga')).not.toBeNull();
    expect(content.closest('.collapsible-body')?.hasAttribute('hidden')).toBe(true);
  });

  it('leaves the diagram, the selection and the undo history alone', async () => {
    renderWorkspace();
    act(() => {
      const id = useDiagram.getState().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
      useDiagram.getState().select([id]);
    });
    const { diagram, selection, history } = useDiagram.getState();
    await userEvent.click(button('Recolher painel lateral'));
    await userEvent.click(button('Recolher paleta'));
    await userEvent.click(button('Expandir painel lateral'));
    expect(useDiagram.getState().diagram).toBe(diagram);
    expect(useDiagram.getState().selection).toBe(selection);
    expect(useDiagram.getState().history).toBe(history);
  });

  it('focuses the canvas, then restores the panels as they were (edge-hover FR-12)', async () => {
    renderWorkspace();
    await userEvent.click(button('Recolher painel lateral'));
    await userEvent.click(button('Focar no canvas'));
    expect(useLayout.getState().collapsed).toEqual({
      palette: true,
      side: true,
      top: true,
      metrics: true,
    });
    const restore = button('Restaurar painéis');
    expect(restore.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(restore);
    expect(useLayout.getState().collapsed).toEqual({ ...EXPANDED, side: true });
    expect(button('Focar no canvas').getAttribute('aria-pressed')).toBe('false');
  });
});
