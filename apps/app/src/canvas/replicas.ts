import type { Service } from '@archsim/catalog';
import type { DiagramNode } from '@archsim/sim-engine';

/** How many interchangeable units a card stands for, when it is more than one (replica-groups FR-1, FR-2). */
export interface ReplicaGroup {
  /** Copies to show, the primary included. */
  count: number;
  /** "6 réplicas", "4 shards", "primário + 2 réplicas de leitura". */
  label: string;
  /** The first copy is a primary that the others replicate (RDS, Aurora). */
  primary: boolean;
}

/** Params that count interchangeable units, as the findings read them (sim-engine findings.ts). */
const UNIT_PARAMS = ['units', 'shards', 'prefixes'] as const;

export function replicaGroup(
  node: Pick<DiagramNode, 'props'>,
  service: Service | undefined,
): ReplicaGroup | null {
  if (!service) return null;
  for (const key of UNIT_PARAMS) {
    const param = service.params.find((p) => p.key === key);
    if (!param) continue;
    const count = Math.round(node.props[key] ?? param.default);
    if (count < 2) return null;
    return { count, label: `${String(count)} ${param.label.toLowerCase()}`, primary: false };
  }
  const read = service.params.find((p) => p.key === 'readReplicas');
  if (!read) return null;
  const replicas = Math.round(node.props.readReplicas ?? read.default);
  if (replicas < 1) return null;
  return {
    count: replicas + 1,
    label: `primário + ${String(replicas)} ${replicas === 1 ? 'réplica de leitura' : 'réplicas de leitura'}`,
    primary: true,
  };
}
