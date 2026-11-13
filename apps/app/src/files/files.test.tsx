import { catalog } from '@archsim/catalog';
import { LIMITS, parseDiagram, serializeDiagram } from '@archsim/sim-engine';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas } from '../canvas/Canvas';
import { emptyDiagram, problemStart } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { FileMenu } from './FileMenu';
import { downloadDiagram, fileName, readDiagramFile } from './save-open';

function fixture(name: string): string {
  const roots = [
    join(process.cwd(), 'apps/app/fixtures/files'),
    join(process.cwd(), 'fixtures/files'),
  ];
  for (const r of roots) {
    try {
      return readFileSync(join(r, name), 'utf8');
    } catch {
      // try the next root
    }
  }
  throw new Error(`fixture ${name} not found`);
}

function asFile(text: string, name = 'x.archsim.json'): File {
  return new File([text], name, { type: 'application/json' });
}

class Observer {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
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
  useDiagram.getState().start({ kind: 'free' }, emptyDiagram());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('save and open (FR-34, FR-35)', () => {
  it('names the file from the diagram name', () => {
    expect(fileName('Encurtador de URL — referência')).toBe(
      'encurtador-de-url-referencia.archsim.json',
    );
    expect(fileName(undefined)).toBe('diagrama.archsim.json');
  });

  it('round-trips a diagram exactly', async () => {
    const original = parseDiagram(fixture('reference.archsim.json'), catalog);
    if (!original.ok) throw new Error(original.message);
    const r = await readDiagramFile(asFile(serializeDiagram(original.diagram)));
    expect(r.ok && r.diagram).toEqual(original.diagram);
  });

  it('downloads through a temporary link', () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    downloadDiagram({ ...emptyDiagram(), name: 'Meu desenho' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it.each([
    ['broken JSON', '{"schemaVersion":', /JSON válido/],
    ['unknown version', JSON.stringify({ ...emptyDiagram(), schemaVersion: 2 }), /Versão/],
    [
      'unknown service',
      JSON.stringify({
        ...emptyDiagram(),
        nodes: [
          {
            id: 'a',
            serviceId: 'aws.nope',
            variantId: 'x',
            position: { x: 0, y: 0 },
            label: '',
            props: {},
            overrides: {},
          },
        ],
      }),
      /desconhecido/,
    ],
  ])(
    'refuses %s with a specific message and keeps the current diagram',
    async (_name, text, message) => {
      const user = userEvent.setup();
      useDiagram.getState().addNode('aws.ec2', { x: 0, y: 0 });
      const before = useDiagram.getState().diagram;
      render(<FileMenu />);
      await user.upload(screen.getByLabelText('Arquivo de diagrama'), asFile(text));
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(message);
      });
      expect(useDiagram.getState().diagram).toBe(before);
    },
  );

  it('refuses files over 5 MB before reading them', async () => {
    const text = vi.fn(() => Promise.resolve(''));
    const r = await readDiagramFile({ size: LIMITS.maxBytes + 1, text });
    expect(r.ok ? 'OK' : r.code).toBe('TOO_LARGE');
    expect(text).not.toHaveBeenCalled();
  });

  it('refuses more than 200 nodes', async () => {
    const d = emptyDiagram();
    d.nodes = Array.from({ length: 201 }, (_, i) => ({
      id: `n${i}`,
      serviceId: 'aws.ec2',
      variantId: 't3.micro',
      position: { x: 0, y: 0 },
      label: '',
      props: {},
      overrides: {},
    }));
    const r = await readDiagramFile(asFile(JSON.stringify(d)));
    expect(r.ok ? 'OK' : r.code).toBe('TOO_MANY_NODES');
  });

  it('opens a valid file and replaces the diagram (undoable)', async () => {
    const user = userEvent.setup();
    render(<FileMenu />);
    await user.upload(
      screen.getByLabelText('Arquivo de diagrama'),
      asFile(fixture('reference.archsim.json')),
    );
    await waitFor(() => {
      expect(useDiagram.getState().diagram.nodes.length).toBe(5);
    });
    useDiagram.getState().undo();
    expect(useDiagram.getState().diagram.nodes).toHaveLength(0);
  });

  it('keeps the problem load when a file is opened inside a problem', async () => {
    const load = {
      classes: [
        {
          name: 'redirect',
          label: 'R',
          mode: 'rps' as const,
          op: 'read' as const,
          rps: 1,
          payloadKB: 1,
          cacheable: true,
        },
        {
          name: 'create',
          label: 'C',
          mode: 'rps' as const,
          op: 'write' as const,
          rps: 1,
          payloadKB: 1,
          cacheable: false,
        },
      ],
    };
    useDiagram
      .getState()
      .start({ kind: 'problem', problemId: 'url-shortener' }, problemStart(load));
    const user = userEvent.setup();
    render(<FileMenu />);
    await user.upload(
      screen.getByLabelText('Arquivo de diagrama'),
      asFile(fixture('reference.archsim.json')),
    );
    await waitFor(() => {
      expect(useDiagram.getState().diagram.nodes.length).toBe(5);
    });
    expect(useDiagram.getState().diagram.load).toEqual(load);
  });
});

describe('untrusted files (PRD §12 A05, A08)', () => {
  it('renders HTML in labels as text, never as elements', async () => {
    const r = await readDiagramFile(asFile(fixture('xss-label.archsim.json')));
    if (!r.ok) throw new Error(r.message);
    useDiagram.getState().replaceDiagram(r.diagram);
    const { container } = render(<Canvas />);
    await waitFor(() => {
      expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg[onload]')).toBeNull();
  });

  it('drops __proto__ without polluting Object.prototype', async () => {
    const r = await readDiagramFile(asFile(fixture('proto.archsim.json')));
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('opens a cyclic diagram (the engine flags the cycle, the file is valid)', async () => {
    const r = await readDiagramFile(asFile(fixture('cyclic.archsim.json')));
    expect(r.ok).toBe(true);
  });
});
