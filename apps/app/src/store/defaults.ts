import { catalog } from '@archsim/catalog';
import type { Diagram, Load } from '@archsim/sim-engine';
import { currentLang } from '../i18n/store';
import { translate } from '../i18n/t';

/** The free canvas's starting load; its label in the language active when it is created. */
export function freeLoad(): Load {
  return {
    classes: [
      {
        name: 'default',
        label: translate(currentLang(), 'load.defaultClass'),
        mode: 'rps',
        op: 'read',
        rps: 100,
        payloadKB: 1,
        cacheable: true,
      },
    ],
  };
}

export function emptyDiagram(load: Load = freeLoad()): Diagram {
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
        label: translate(currentLang(), 'load.users'),
        props: {},
        overrides: {},
      },
    ],
  };
}
