import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/i18n/en';
import { pt, type Key } from '../src/i18n/pt';

const ROOT = join(import.meta.dirname, '..', '..', '..');

export function reference(problemId: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(ROOT, 'problems', problemId, 'reference.archsim.json'), 'utf8'),
  ) as Record<string, unknown>;
}

/** Start the page with a saved diagram, as autosave would have left it. */
export async function seed(page: Page, key: string, diagram: unknown): Promise<void> {
  await page.addInitScript(
    ([k, d]) => {
      localStorage.setItem(k, JSON.stringify(d));
    },
    [key, diagram] as const,
  );
}

/** Collects page errors and CSP violations. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => {
    // Benign: WebKit reports it when React Flow's observers resize in the same frame.
    if (e.message.startsWith('ResizeObserver loop completed')) return;
    problems.push(`pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /Content[- ]Security[- ]Policy/i.test(t))
      problems.push(`${m.type()}: ${t}`);
  });
  return problems;
}

export function withUnits<T extends Record<string, unknown>>(
  d: T,
  nodeId: string,
  units: number,
): T {
  const copy = structuredClone(d) as T & { nodes: { id: string; props: Record<string, number> }[] };
  const n = copy.nodes.find((x) => x.id === nodeId);
  if (n) n.props.units = units;
  return copy;
}

/** What the mentor wrote, and the PT button itself: data, shown as it was written (language-switch §9). */
const USER_CONTENT = '.chat-msg, .proposal-summary, [lang="pt-BR"]';

/**
 * Every piece of the app's Portuguese texts that the English side does not share,
 * split at the placeholders: if one shows up on an English page, a text was missed.
 */
const PT_PIECES = [
  ...new Set(
    (Object.keys(pt) as Key[])
      .filter((k) => pt[k] !== en[k])
      .flatMap((k) => pt[k].split(/\{\w+\}/))
      .map((s) => s.trim().replace(/^[\s:·—–(),.+−-]+|[\s:·—–(),.+−-]+$/g, ''))
      .filter((s) => s.length >= 4 && !Object.values(en).some((e) => e.includes(s))),
  ),
];

/** Accents and words that exist in Portuguese and not in the English texts. */
const PORTUGUESE =
  /[çãõâêôáéíóú]|\b(não|você|uma|nó|nós|carga|custo|enunciado|requisitos?|problemas?|estudo|conexão|réplicas?|fila|gargalo|mês|abrir|salvar|fechar|enviar|pergunte|selecione|nenhum)\b/i;

/**
 * Portuguese left on the page — in the text, `aria-label`, `title` and
 * `placeholder` — outside what the person or the mentor wrote (language-switch FR-11).
 */
export async function portugueseLeftovers(page: Page): Promise<string[]> {
  const found = await page.evaluate(
    ([skip, source, pieces]) => {
      const words = new RegExp(source, 'i');
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const known = pieces.map((p) => new RegExp(`(^|[^\\p{L}])${escape(p)}($|[^\\p{L}])`, 'u'));
      const re = { test: (s: string) => words.test(s) || known.some((k) => k.test(s)) };
      const out: string[] = [];
      const outside = (el: Element) => el.closest(skip) === null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        const el = n.parentElement;
        if (text === '' || !el || !outside(el) || el.closest('[hidden], script, style')) continue;
        if (re.test(text)) out.push(text);
      }
      for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
        if (!outside(el)) continue;
        for (const a of ['aria-label', 'title', 'placeholder']) {
          const v = el.getAttribute(a);
          if (v && re.test(v)) out.push(`${a}="${v}"`);
        }
      }
      return out;
    },
    [USER_CONTENT, PORTUGUESE.source, PT_PIECES] as const,
  );
  return [...new Set(found)];
}

/** Open the app in a language, as a stored choice would. */
export async function inLanguage(page: Page, lang: 'pt' | 'en'): Promise<void> {
  await page.addInitScript((l) => {
    localStorage.setItem('archsim:lang', l);
  }, lang);
}
