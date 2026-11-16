import type { Service } from '@archsim/catalog';
import type { DiagramNode } from '@archsim/sim-engine';
import type { Lang } from '../i18n/lang';
import { translate } from '../i18n/t';

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
  lang: Lang = 'pt',
): ReplicaGroup | null {
  if (!service) return null;
  for (const key of UNIT_PARAMS) {
    const param = service.params.find((p) => p.key === key);
    if (!param) continue;
    const count = Math.round(node.props[key] ?? param.default);
    if (count < 2) return null;
    const label = translate(lang, 'replicas.units', { n: count, unit: param.label.toLowerCase() });
    return { count, label, primary: false };
  }
  const read = service.params.find((p) => p.key === 'readReplicas');
  if (!read) return null;
  const replicas = Math.round(node.props.readReplicas ?? read.default);
  if (replicas < 1) return null;
  return {
    count: replicas + 1,
    label: translate(lang, replicas === 1 ? 'replicas.readOne' : 'replicas.readOther', {
      n: replicas,
    }),
    primary: true,
  };
}
