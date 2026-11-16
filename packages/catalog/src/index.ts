import english from './catalog.en.json' with { type: 'json' };
import data from './catalog.json' with { type: 'json' };
import { localizeCatalog, parseCatalogText, type CatalogLang, type CatalogText } from './localize';
import { parseCatalog, type Catalog, type Service, type Variant } from './schema';

export * from './localize';
export * from './schema';

function load(): Catalog {
  const result = parseCatalog(data);
  if (!result.ok) throw new Error(`catalog.json inválido:\n${result.message}`);
  return result.value;
}

/** The bundled catalog, validated once at import. An invalid file is a bug. */
export const catalog: Catalog = load();

function loadText(): CatalogText {
  const result = parseCatalogText(english);
  if (!result.ok) throw new Error(`catalog.en.json inválido:\n${result.message}`);
  return result.value;
}

/** The catalog's texts in English (language-switch FR-6), validated once at import. */
export const catalogTextEn: CatalogText = loadText();

/** The bundled catalog with its texts in `lang`; the same object for `pt`. */
export function catalogIn(lang: CatalogLang): Catalog {
  return localizeCatalog(catalog, lang, catalogTextEn);
}

export function findService(c: Catalog, serviceId: string): Service | undefined {
  return c.services.find((s) => s.id === serviceId);
}

export function findVariant(service: Service, variantId: string): Variant | undefined {
  return service.variants.find((v) => v.id === variantId);
}
