import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialTheme, readStoredTheme, storeTheme } from './theme';
import { ThemeToggle } from './ThemeToggle';

function mockSystem(light: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: light && q.includes('light'), media: q }));
}

describe('theme (FR-32)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows a dark system by default', () => {
    mockSystem(false);
    expect(initialTheme()).toBe('dark');
  });

  it('follows a light system by default', () => {
    mockSystem(true);
    expect(initialTheme()).toBe('light');
  });

  it('switches without reloading and persists the choice', async () => {
    mockSystem(false);
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: /tema claro/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(readStoredTheme()).toBe('light');
    expect(initialTheme()).toBe('light');
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
    expect(readStoredTheme(broken)).toBeNull();
    expect(() => {
      storeTheme('light', broken);
    }).not.toThrow();
  });
});
