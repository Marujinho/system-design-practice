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
    { name: 'default', label: 'Requisições', mode: 'rps', rps: 100, payloadKB: 1, cacheable: true },
  ],
): Diagram {
  return { schemaVersion: 1, catalogVersion: '2026-11-13.1', nodes, edges, load: { classes } };
}
