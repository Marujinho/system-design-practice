import { catalog } from '@archsim/catalog';
import type { Diagram, Load } from '@archsim/sim-engine';

export const FREE_LOAD: Load = {
  classes: [
    {
      name: 'default',
      label: 'Requisições',
      mode: 'rps',
      op: 'read',
      rps: 100,
      payloadKB: 1,
      cacheable: true,
    },
  ],
};

export function emptyDiagram(load: Load = FREE_LOAD): Diagram {
  return { schemaVersion: 1, catalogVersion: catalog.catalogVersion, nodes: [], edges: [], load };
}

/** A problem starts with the Users node carrying the problem's load (FR-44). */
export function problemStart(load: Load): Diagram {
  return {
    ...emptyDiagram(load),
    nodes: [
      {
        id: 'users',
        serviceId: 'core.users',
        variantId: 'default',
        position: { x: 0, y: 160 },
        label: 'Usuários',
        props: {},
        overrides: {},
      },
    ],
  };
}
