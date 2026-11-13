import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceFigure } from './figure';
import { figureFor, figureIds } from './registry';

class FakeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function stubBrowser(reduced: boolean) {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced && q.includes('reduce'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('ServiceFigure', () => {
  beforeEach(() => {
    stubBrowser(false);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the figure into an svg with an accessible name', () => {
    const { getByRole, container } = render(<ServiceFigure serviceId="aws.ec2" label="EC2" />);
    expect(getByRole('img', { name: 'EC2' })).toBeTruthy();
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(5);
  });

  it('removes every pointer listener from its stage and empties the svg on unmount', () => {
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    const { container, getByRole, unmount } = render(
      <ServiceFigure serviceId="aws.ec2" label="EC2" />,
    );
    const stage = getByRole('img');
    const svg = container.querySelector('svg');
    const onStage = (spy: typeof add) =>
      spy.mock.calls.filter(
        (call, i) => spy.mock.contexts[i] === stage && call[0].startsWith('pointer'),
      ).length;
    const added = onStage(add);
    unmount();
    expect(added).toBeGreaterThan(0);
    expect(onStage(remove)).toBe(added);
    expect(svg?.childNodes.length).toBe(0);
  });

  it('sets no colour or stroke of its own: classes only, styled from the --hairline-* tokens', () => {
    const { container } = render(<ServiceFigure serviceId="aws.ec2" label="EC2" />);
    // The kernel's own reflection mask (inside <defs>) is not the figure's paint.
    for (const el of container.querySelectorAll('svg *:not(defs, defs *)')) {
      for (const attr of ['fill', 'stroke', 'stroke-width', 'style', 'opacity']) {
        expect(el.getAttribute(attr), `${el.tagName} ${attr}`).toBeNull();
      }
    }
    const css = [...document.querySelectorAll('style[data-hairline-style]')]
      .map((s) => s.textContent)
      .join('');
    expect(css).toContain('var(--hairline-plate');
    expect(css).toContain('var(--hairline-stroke');
  });

  it('mounts 50 instances without error', () => {
    expect(() =>
      render(
        <div>
          {Array.from({ length: 50 }, (_, i) => (
            <ServiceFigure key={i} serviceId="aws.ec2" label={`EC2 ${i}`} />
          ))}
        </div>,
      ),
    ).not.toThrow();
  });

  it('renders nothing for a service without a figure', () => {
    const { container } = render(<ServiceFigure serviceId="aws.nope" label="?" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('reduced motion (FR-31)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('never starts the frame loop on its own', () => {
    stubBrowser(true);
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    render(<ServiceFigure serviceId="aws.ec2" label="EC2" />);
    expect(raf).not.toHaveBeenCalled();
  });
});

describe('registry', () => {
  it('maps service ids to figures', () => {
    expect(figureIds()).toContain('aws.ec2');
    expect(figureFor('aws.ec2')?.name).toBe('rack');
  });
});
