import { catalog, findService, findVariant } from '@archsim/catalog';
import type { RequestClass } from './diagram';
import { makeContext } from './kinds/context';
import type { NodeContext, NodeState } from './kinds/types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Diagram, DiagramEdge, DiagramNode } from './diagram';

export function fixtureText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');
}

export function fixture(name: string): Diagram {
  return JSON.parse(fixtureText(name)) as Diagram;
}

export function node(
  id: string,
  serviceId: string,
  variantId: string,
  props: Record<string, number> = {},
  overrides: Record<string, number> = {},
): DiagramNode {
  return { id, serviceId, variantId, position: { x: 0, y: 0 }, label: id, props, overrides };
}

export function edge(
  source: string,
  target: string,
  extra: Partial<Pick<DiagramEdge, 'weight' | 'classes' | 'protocol'>> = {},
): DiagramEdge {
  return { id: `${source}-${target}`, source, target, protocol: 'http', ...extra };
}

export function diagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  classes: Diagram['load']['classes'] = [
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
): Diagram {
  return { schemaVersion: 1, catalogVersion: '2026-11-13.1', nodes, edges, load: { classes } };
}

export const READ: RequestClass = {
  name: 'read',
  label: 'Leitura',
  mode: 'rps',
  op: 'read',
  rps: 0,
  payloadKB: 1,
  cacheable: true,
};
export const WRITE: RequestClass = {
  ...READ,
  name: 'write',
  label: 'Escrita',
  op: 'write',
  cacheable: false,
};

export function ctxFor(
  serviceId: string,
  variantId: string,
  options: {
    props?: Record<string, number>;
    overrides?: Record<string, number>;
    classes?: RequestClass[];
    state?: NodeState;
    dtMs?: number;
    downstreamCapacity?: number;
    outDegree?: number;
  } = {},
): NodeContext {
  const service = findService(catalog, serviceId);
  if (!service) throw new Error(`no service ${serviceId}`);
  const variant = findVariant(service, variantId);
  if (!variant) throw new Error(`no variant ${variantId}`);
  const classes = options.classes ?? [READ, WRITE];
  return makeContext({
    node: node('n', serviceId, variantId, options.props ?? {}, options.overrides ?? {}),
    service,
    variant,
    classes: new Map(classes.map((c) => [c.name, c])),
    dtMs: options.dtMs ?? 100,
    state: options.state ?? {},
    downstreamCapacity: options.downstreamCapacity ?? 0,
    outDegree: options.outDegree ?? 1,
  });
}
