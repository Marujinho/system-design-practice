import data from './catalog.json' with { type: 'json' };
import { parseCatalog, type Catalog, type Service, type Variant } from './schema';

export * from './schema';

function load(): Catalog {
  const result = parseCatalog(data);
  if (!result.ok) throw new Error(`catalog.json inválido:\n${result.message}`);
  return result.value;
}

/** The bundled catalog, validated once at import. An invalid file is a bug. */
export const catalog: Catalog = load();

export function findService(c: Catalog, serviceId: string): Service | undefined {
  return c.services.find((s) => s.id === serviceId);
}

export function findVariant(service: Service, variantId: string): Variant | undefined {
  return service.variants.find((v) => v.id === variantId);
}
