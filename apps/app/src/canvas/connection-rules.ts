import { catalog, findService, type Kind, type Service } from '@archsim/catalog';
import type { Diagram, DiagramEdge, Protocol } from '@archsim/sim-engine';

/** The protocol a new connection starts with, from the pair of kinds (FR-5). */
export function defaultProtocol(source: Kind, target: Kind): Protocol {
  if (target === 'queue' || target === 'stream') return 'queue';
  if (source === 'pubsub') return 'pubsub';
  if (target === 'pubsub') return 'pubsub';
  if (target === 'sql-database' || target === 'kv-database' || target === 'cache') return 'tcp';
  if (source === 'queue' || source === 'stream') return 'queue';
  return 'http';
}

/** Why a connection is unusual, or null when the catalog expects it (FR-6). Never blocks. */
export function connectionWarning(source: Service, target: Service): string | null {
  if (source.validTargetKinds.includes(target.kind)) return null;
  return `${source.label} → ${target.label} não é uma conexão comum; confira se é isso mesmo.`;
}

export function edgeWarning(diagram: Diagram, edge: DiagramEdge): string | null {
  const s = diagram.nodes.find((n) => n.id === edge.source);
  const t = diagram.nodes.find((n) => n.id === edge.target);
  const ss = s ? findService(catalog, s.serviceId) : undefined;
  const ts = t ? findService(catalog, t.serviceId) : undefined;
  return ss && ts ? connectionWarning(ss, ts) : null;
}

export function protocolFor(diagram: Diagram, source: string, target: string): Protocol {
  const s = diagram.nodes.find((n) => n.id === source);
  const t = diagram.nodes.find((n) => n.id === target);
  const sk = s ? findService(catalog, s.serviceId)?.kind : undefined;
  const tk = t ? findService(catalog, t.serviceId)?.kind : undefined;
  return sk && tk ? defaultProtocol(sk, tk) : 'http';
}
