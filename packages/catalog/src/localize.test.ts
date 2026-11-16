import { describe, expect, it } from 'vitest';
import { catalog, catalogIn, catalogTextEn, findService } from './index';
import { catalogTextGaps, localizeCatalog, parseCatalogText, type CatalogText } from './localize';
import type { Catalog } from './schema';

/** The catalog without its texts: what must not change between languages. */
function numbers(c: Catalog): unknown {
  return JSON.parse(
    JSON.stringify(c, (key, value: unknown) =>
      key === 'label' || key === 'description' || key === 'unit' ? undefined : value,
    ),
  );
}

describe('the catalog in English (language-switch FR-6, NFR-2, A08)', () => {
  it('translates every service, variant, param, price and limit, and names nothing that does not exist', () => {
    expect(catalogTextGaps(catalog, catalogTextEn)).toEqual([]);
  });

  it('has no Portuguese left in its texts', () => {
    const en = catalogIn('en');
    const texts = en.services.flatMap((s) => [
      s.label,
      s.description,
      ...s.params.flatMap((p) => [p.label, p.unit]),
      ...s.variants.flatMap((v) => [
        v.label,
        ...v.prices.map((p) => p.label),
        ...v.limits.flatMap((l) => [l.label, l.unit]),
      ]),
    ]);
    const portuguese = texts.filter((t) => /[çãõáéíóúâêô]|\b(não|por|de|da|do|para)\b/i.test(t));
    expect(portuguese).toEqual([]);
  });

  it('changes no number, id or price', () => {
    expect(numbers(catalogIn('en'))).toEqual(numbers(catalog));
  });

  it('is the catalog itself in Portuguese, and the same object on every call in English', () => {
    expect(catalogIn('pt')).toBe(catalog);
    expect(catalogIn('en')).toBe(catalogIn('en'));
  });

  it('swaps the texts', () => {
    const rds = findService(catalogIn('en'), 'aws.rds-postgres');
    expect(rds?.params.find((p) => p.key === 'readReplicas')?.label).toBe('Read replicas');
    expect(findService(catalogIn('en'), 'core.users')?.label).toBe('Users / Internet');
  });

  it('keeps Portuguese where a translation is missing', () => {
    const text: CatalogText = { services: {} };
    const en = localizeCatalog(catalog, 'en', text);
    expect(findService(en, 'aws.ec2')?.label).toBe(findService(catalog, 'aws.ec2')?.label);
    expect(catalogTextGaps(catalog, text)).toContain('missing aws.ec2');
  });

  it('finds orphan keys', () => {
    const text = structuredClone(catalogTextEn);
    const ec2 = text.services['aws.ec2'];
    if (!ec2) throw new Error('aws.ec2 missing');
    ec2.params.nope = { label: 'Nope' };
    text.services['aws.nope'] = ec2;
    expect(catalogTextGaps(catalog, text)).toEqual(
      expect.arrayContaining(['orphan aws.nope', 'orphan aws.ec2.params.nope']),
    );
  });

  it('refuses a file with an unknown field or an empty text', () => {
    expect(parseCatalogText({ services: {}, extra: 1 }).ok).toBe(false);
    const empty = structuredClone(catalogTextEn) as { services: Record<string, { label: string }> };
    const ec2 = empty.services['aws.ec2'];
    if (ec2) ec2.label = '';
    expect(parseCatalogText(empty).ok).toBe(false);
  });
});
