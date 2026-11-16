import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatNumber, formatUsd } from '../format';
import { ThemeToggle } from '../theme/ThemeToggle';
import { en } from './en';
import { applyLang, browserLang, initialLang, readStoredLang, storeLang } from './lang';
import { LanguageToggle } from './LanguageToggle';
import { pt } from './pt';
import { useLangStore } from './store';
import { interpolate, translate, useT } from './t';

const broken = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('language preference (FR-3, FR-4, A08, A10)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('follows the browser on a first visit: en-* → en, anything else → pt', () => {
    expect(browserLang('en-GB')).toBe('en');
    expect(browserLang('EN-us')).toBe('en');
    expect(browserLang('pt-PT')).toBe('pt');
    expect(browserLang('fr-FR')).toBe('pt');
    expect(browserLang(undefined)).toBe('pt');
  });

  it('lets a stored choice win over the browser', () => {
    storeLang('en');
    expect(readStoredLang()).toBe('en');
    expect(initialLang()).toBe('en'); // the test browser says pt-BR
  });

  it('ignores a stored value that is not one of the two', () => {
    localStorage.setItem('archsim:lang', 'fr');
    expect(readStoredLang()).toBeNull();
    localStorage.setItem('archsim:lang', '<script>');
    expect(initialLang()).toBe('pt');
  });

  it('survives storage that throws', () => {
    expect(readStoredLang(broken)).toBeNull();
    expect(() => {
      storeLang('en', broken);
    }).not.toThrow();
  });

  it('sets <html lang> (FR-12)', () => {
    applyLang('en');
    expect(document.documentElement.lang).toBe('en');
    applyLang('pt');
    expect(document.documentElement.lang).toBe('pt-BR');
  });
});

describe('translate (NFR-2, NFR-3, A05)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the same keys and placeholders in both languages', () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const key of Object.keys(pt) as (keyof typeof pt)[]) {
      expect(holes(en[key]), key).toEqual(holes(pt[key]));
      expect(en[key].trim(), key).not.toBe('');
    }
  });

  it('falls back to Portuguese, never the raw key, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const text = translate('en', 'lang.group', undefined, { pt, en: {} });
    expect(text).toBe(pt['lang.group']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('interpolates values as plain text', () => {
    expect(interpolate('Nó {name} a {n}%', { name: '<b>x</b>', n: 3 })).toBe('Nó <b>x</b> a 3%');
    expect(interpolate('sem {nada}', {})).toBe('sem {nada}');
  });

  it('renders an interpolated <b> as text, not markup', () => {
    function Probe() {
      return <p>{interpolate('{x}', { x: '<b>bold</b>' })}</p>;
    }
    const { container } = render(<Probe />);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('<b>bold</b>');
  });
});

describe('formatting follows the language (FR-10)', () => {
  it('formats numbers, money and dates per language', () => {
    expect(formatNumber(1234.56, 2)).toBe('1.234,56');
    expect(formatUsd(1234.5)).toBe('US$ 1.234,50');
    expect(formatDate('2026-11-13T10:00:00Z')).toBe('13/11/2026');
    act(() => {
      useLangStore.getState().setLang('en');
    });
    expect(formatNumber(1234.56, 2)).toBe('1,234.56');
    expect(formatUsd(1234.5)).toBe('US$ 1,234.50');
    expect(formatDate('2026-11-13T10:00:00Z')).toBe('11/13/2026');
  });
});

describe('LanguageToggle (FR-1, FR-2, NFR-4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function Label() {
    const t = useT();
    return <span data-testid="label">{t('lang.group')}</span>;
  }

  it('marks the active language and switches the texts without remounting', async () => {
    render(
      <>
        <LanguageToggle />
        <ThemeToggle />
        <Label />
      </>,
    );
    const label = screen.getByTestId('label');
    expect(screen.getByRole('button', { name: 'Português' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(label).toHaveTextContent('Idioma');
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Português' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('label')).toBe(label); // same element: re-rendered, not remounted
    expect(label).toHaveTextContent('Language');
    expect(screen.getByRole('button', { name: /switch to the (light|dark) theme/i })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    expect(readStoredLang()).toBe('en');
  });

  it('works from the keyboard', async () => {
    render(<LanguageToggle />);
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'English' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(useLangStore.getState().lang).toBe('en');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift} ');
    expect(useLangStore.getState().lang).toBe('pt');
  });
});
