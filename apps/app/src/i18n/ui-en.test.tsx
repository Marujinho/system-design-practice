import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Palette } from '../canvas/Palette';
import { LoadPanel } from '../panels/LoadPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { apiErrorOf } from '../practice/api';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { useLangStore } from './store';

const s = () => useDiagram.getState();
const english = () => {
  act(() => {
    useLangStore.getState().setLang('en');
  });
};

/** App texts that must not survive in English; catalog texts are checked by the catalog's tests. */
const PORTUGUESE = [
  'Buscar serviço',
  'Entrada',
  'Computação',
  'Nome no desenho',
  'Capacidade',
  'Custo',
  'Números da simulação',
  'Latência base',
  'Preços',
  'cota AWS',
  'premissa',
  '/mês',
  'Selecione',
  'Salvar arquivo',
  'Abrir arquivo',
  'Pausar',
  'Carga',
];

function leftovers(text: string): string[] {
  return PORTUGUESE.filter((p) => text.includes(p));
}

describe('the canvas and the panels in English (language-switch FR-5)', () => {
  beforeEach(() => {
    s().start({ kind: 'free' }, emptyDiagram());
  });

  it('palette: search, categories and the empty state', () => {
    english();
    const { container } = render(<Palette onAdd={() => undefined} />);
    expect(screen.getByRole('searchbox', { name: 'Search services' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compute' })).toBeInTheDocument();
    expect(leftovers(container.textContent)).toEqual([]);
  });

  it('properties of a node: labels, figures and prices; the name the person typed stays', () => {
    const id = s().addNode('aws.ec2', { x: 0, y: 0 }) ?? '';
    s().setLabel(id, 'Minha API');
    s().select([id]);
    english();
    const { container } = render(<PropertiesPanel />);
    expect(screen.getByLabelText('Name in the diagram')).toHaveValue('Minha API');
    expect(screen.getByText('Simulation numbers')).toBeInTheDocument();
    expect(container.textContent).toMatch(/US\$ [\d,]+\.\d{2}\/month/);
    const attrs = [...container.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label') ?? '')
      .join(' ');
    expect(leftovers(`${container.textContent} ${attrs}`)).toEqual([]);
  });

  it('switches a mounted panel in place', () => {
    render(<PropertiesPanel />);
    expect(screen.getByText('Selecione um nó ou uma conexão.')).toBeInTheDocument();
    english();
    expect(screen.getByText('Select a node or a connection.')).toBeInTheDocument();
  });

  it('load panel and file menu', () => {
    english();
    const { container } = render(<LoadPanel />);
    expect(screen.getByRole('button', { name: 'Save file' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Load' })).toBeInTheDocument();
    expect(leftovers(container.textContent)).toEqual([]);
  });

  it('shows the catalog in English: service, description, params, prices', () => {
    const id = s().addNode('aws.rds-postgres', { x: 0, y: 0 }) ?? '';
    s().select([id]);
    english();
    render(<PropertiesPanel />);
    expect(screen.getByText(/Relational database/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Read replicas/)).toBeInTheDocument();
    expect(screen.getByText(/gp3 storage/)).toBeInTheDocument();
  });

  it('labels a new node in the language active when it is added; a switch keeps it', () => {
    english();
    const id = s().addNode('core.users', { x: 0, y: 0 }) ?? '';
    expect(s().diagram.nodes.find((n) => n.id === id)?.label).toBe('Users / Internet');
    act(() => {
      useLangStore.getState().setLang('pt');
    });
    expect(s().diagram.nodes.find((n) => n.id === id)?.label).toBe('Users / Internet');
  });

  it('a new free canvas starts with its load labelled in the active language', () => {
    english();
    expect(emptyDiagram().load.classes[0]?.label).toBe('Requests');
  });
});

describe('server refusals in the active language (language-switch FR-5)', () => {
  it('shows errorEn in English and error in Portuguese, keeping the Portuguese for matching', () => {
    const body = {
      error: 'já há uma resposta em andamento',
      errorEn: 'a reply is already in progress',
    };
    expect(apiErrorOf(body, 409).message).toBe('já há uma resposta em andamento');
    english();
    const e = apiErrorOf(body, 409);
    expect(e.message).toBe('a reply is already in progress');
    expect(e.pt).toBe('já há uma resposta em andamento');
  });

  it('falls back to error when the server sent no English, and to the status without a body', () => {
    english();
    expect(apiErrorOf({ error: 'só português' }, 400).message).toBe('só português');
    expect(apiErrorOf({ error: 'x', errorEn: 3 }, 400).message).toBe('x');
    expect(apiErrorOf(null, 502).message).toBe('error 502');
  });
});
