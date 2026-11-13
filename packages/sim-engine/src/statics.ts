import { findService, findVariant, type Catalog } from '@archsim/catalog';
import type { DiagramNode, Load, RequestClass } from './diagram';
import { handlers, makeContext } from './kinds';

/** A node's capacity and its cost with no traffic, before any simulation runs (properties panel). */
export function nodeStatics(
  node: DiagramNode,
  catalog: Catalog,
  load: Load,
): { capacity: number; idleCostMonth: number } | null {
  const service = findService(catalog, node.serviceId);
  const variant = service ? findVariant(service, node.variantId) : undefined;
  if (!service || !variant) return null;
  const ctx = makeContext({
    node,
    service,
    variant,
    classes: new Map<string, RequestClass>(load.classes.map((c) => [c.name, c])),
    dtMs: 100,
    state: {},
  });
  const h = handlers[service.kind];
  const capacity = h.capacity(ctx);
  return {
    capacity: Number.isFinite(capacity) ? capacity : Number.POSITIVE_INFINITY,
    idleCostMonth: h.process({}, ctx).costMonth,
  };
}
