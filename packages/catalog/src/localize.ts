import { z } from 'zod';
import type { Catalog, ParseResult } from './schema';

/** The languages the catalog's texts exist in; Portuguese is `catalog.json` itself. */
export type CatalogLang = 'pt' | 'en';

const Text = z.string().min(1);
const LimitText = z.object({ label: Text, unit: z.string().optional() }).strict();

const ServiceText = z
  .object({
    label: Text,
    description: Text,
    params: z.record(z.string(), z.object({ label: Text, unit: z.string().optional() }).strict()),
    /** A price or limit label shared by every variant; a variant may override it. */
    prices: z.record(z.string(), Text),
    limits: z.record(z.string(), LimitText),
    variants: z.record(
      z.string(),
      z
        .object({
          label: Text.optional(),
          prices: z.record(z.string(), Text).optional(),
          limits: z.record(z.string(), LimitText).optional(),
        })
        .strict(),
    ),
  })
  .strict();

/** The catalog's texts in another language, by id; numbers and ids stay in `catalog.json` (language-switch FR-6). */
export const CatalogText = z.object({ services: z.record(z.string(), ServiceText) }).strict();
export type CatalogText = z.infer<typeof CatalogText>;

export function parseCatalogText(input: unknown): ParseResult<CatalogText> {
  const result = CatalogText.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, message: z.prettifyError(result.error) };
}

/**
 * Every text of the catalog that `text` does not translate, and every key of
 * `text` that names nothing in the catalog, as paths (NFR-2).
 */
export function catalogTextGaps(c: Catalog, text: CatalogText): string[] {
  const gaps: string[] = [];
  const ids = new Set(c.services.map((s) => s.id));
  for (const id of Object.keys(text.services)) if (!ids.has(id)) gaps.push(`orphan ${id}`);
  for (const s of c.services) {
    const t = text.services[s.id];
    if (!t) {
      gaps.push(`missing ${s.id}`);
      continue;
    }
    const keys = new Set(s.params.map((p) => p.key));
    for (const p of s.params) {
      const pt = t.params[p.key];
      if (!pt) gaps.push(`missing ${s.id}.params.${p.key}`);
      else if (p.unit !== '' && pt.unit === undefined)
        gaps.push(`missing ${s.id}.params.${p.key}.unit`);
    }
    for (const k of Object.keys(t.params))
      if (!keys.has(k)) gaps.push(`orphan ${s.id}.params.${k}`);
    const variantIds = new Set(s.variants.map((v) => v.id));
    for (const k of Object.keys(t.variants))
      if (!variantIds.has(k)) gaps.push(`orphan ${s.id}.variants.${k}`);
    const priceIds = new Set<string>();
    const limitIds = new Set<string>();
    for (const v of s.variants) {
      const vt = t.variants[v.id];
      if (vt?.label === undefined) gaps.push(`missing ${s.id}.variants.${v.id}.label`);
      for (const p of v.prices) {
        priceIds.add(p.id);
        if (vt?.prices?.[p.id] === undefined && t.prices[p.id] === undefined)
          gaps.push(`missing ${s.id}.${v.id}.prices.${p.id}`);
      }
      for (const l of v.limits) {
        limitIds.add(l.id);
        if (vt?.limits?.[l.id] === undefined && t.limits[l.id] === undefined)
          gaps.push(`missing ${s.id}.${v.id}.limits.${l.id}`);
      }
    }
    for (const k of Object.keys(t.prices))
      if (!priceIds.has(k)) gaps.push(`orphan ${s.id}.prices.${k}`);
    for (const k of Object.keys(t.limits))
      if (!limitIds.has(k)) gaps.push(`orphan ${s.id}.limits.${k}`);
  }
  return gaps;
}

const cache = new WeakMap<Catalog, WeakMap<CatalogText, Catalog>>();

/**
 * The catalog with its texts in `lang`: labels, descriptions and units swapped,
 * every number, id and price untouched. A text with no translation stays in
 * Portuguese. `pt` returns the catalog itself (language-switch FR-6).
 */
export function localizeCatalog(c: Catalog, lang: CatalogLang, text: CatalogText): Catalog {
  if (lang === 'pt') return c;
  const byText = cache.get(c) ?? new WeakMap<CatalogText, Catalog>();
  cache.set(c, byText);
  const hit = byText.get(text);
  if (hit) return hit;
  const out: Catalog = {
    ...c,
    services: c.services.map((s) => {
      const t = text.services[s.id];
      if (!t) return s;
      return {
        ...s,
        label: t.label,
        description: t.description,
        params: s.params.map((p) => {
          const pt = t.params[p.key];
          return pt ? { ...p, label: pt.label, unit: pt.unit ?? p.unit } : p;
        }),
        variants: s.variants.map((v) => {
          const vt = t.variants[v.id];
          return {
            ...v,
            label: vt?.label ?? v.label,
            prices: v.prices.map((p) => ({
              ...p,
              label: vt?.prices?.[p.id] ?? t.prices[p.id] ?? p.label,
            })),
            limits: v.limits.map((l) => {
              const lt = vt?.limits?.[l.id] ?? t.limits[l.id];
              return lt ? { ...l, label: lt.label, unit: lt.unit ?? l.unit } : l;
            }),
          };
        }),
      };
    }),
  };
  byText.set(text, out);
  return out;
}
