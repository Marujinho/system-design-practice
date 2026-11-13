import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDiagram } from '../store/defaults';
import { useDiagram } from '../store/diagram-store';
import { EXPANDED, readLayout, storeLayout, useLayout } from './layout-store';

const KEY = 'archsim:layout';
const l = () => useLayout.getState();

beforeEach(() => {
  localStorage.clear();
  useLayout.setState({ collapsed: { ...EXPANDED }, before: null });
});

describe('readLayout / storeLayout (FR-13, NFR-5, A06, A10)', () => {
  it('starts expanded with nothing saved', () => {
    expect(readLayout()).toEqual(EXPANDED);
  });

  it('round-trips a saved layout', () => {
    const c = { palette: true, side: false, top: true, metrics: false };
    storeLayout(c);
    expect(readLayout()).toEqual(c);
  });

  it('falls back to expanded on invalid JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(readLayout()).toEqual(EXPANDED);
  });

  it('keeps only booleans for known panels and drops the rest', () => {
    localStorage.setItem(KEY, JSON.stringify({ palette: 'yes', side: true, x: 1 }));
    const out = readLayout();
    expect(out).toEqual({ ...EXPANDED, side: true });
    expect(out).not.toHaveProperty('x');
  });

  it.each(['null', '[]', '1', '"side"'])('falls back to expanded for %s', (raw) => {
    localStorage.setItem(KEY, raw);
    expect(readLayout()).toEqual(EXPANDED);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLayout(broken)).toEqual(EXPANDED);
    expect(() => {
      storeLayout({ ...EXPANDED, side: true }, broken);
    }).not.toThrow();
  });

  it('writes only the four panels', () => {
    const withExtra = { ...EXPANDED, extra: true };
    storeLayout(withExtra);
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY) ?? '{}') as object).sort()).toEqual([
      'metrics',
      'palette',
      'side',
      'top',
    ]);
  });
});

describe('useLayout (FR-12, FR-13, FR-14)', () => {
  it('toggles a panel and saves it', () => {
    l().toggle('palette');
    expect(l().collapsed.palette).toBe(true);
    expect(readLayout().palette).toBe(true);
    l().toggle('palette');
    expect(l().collapsed.palette).toBe(false);
  });

  it('focuses the canvas, then restores the layout from before', () => {
    l().toggle('side');
    l().focusCanvas();
    expect(l().collapsed).toEqual({ palette: true, side: true, top: true, metrics: true });
    l().focusCanvas();
    expect(l().collapsed).toEqual({ ...EXPANDED, side: true });
    expect(l().before).toBeNull();
    expect(readLayout()).toEqual({ ...EXPANDED, side: true });
  });

  it('forgets the layout to restore once a panel is toggled by hand', () => {
    l().focusCanvas();
    l().toggle('palette');
    expect(l().before).toBeNull();
    expect(l().collapsed).toEqual({ palette: false, side: true, top: true, metrics: true });
  });

  it('never touches the diagram or its undo history', () => {
    useDiagram.getState().start({ kind: 'free' }, emptyDiagram());
    useDiagram.getState().addNode('aws.ec2', { x: 0, y: 0 });
    const { diagram, history } = useDiagram.getState();
    l().toggle('side');
    l().focusCanvas();
    expect(useDiagram.getState().diagram).toBe(diagram);
    expect(useDiagram.getState().history).toBe(history);
  });
});
