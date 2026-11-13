import type { Diagram, DiagramEdge } from './diagram';
import type { SimWarning } from './warnings';

/** Requests per second, per request class. */
export type ClassRates = Record<string, number>;

export interface GraphAnalysis {
  /** Topological order of every node outside a cycle. */
  order: string[];
  /** Nodes inside a cycle: not simulated (FR-37). */
  cyclic: Set<string>;
  /** Hops from the entry node; Infinity when unreachable. */
  depth: Map<string, number>;
  outEdges: Map<string, DiagramEdge[]>;
  inEdges: Map<string, DiagramEdge[]>;
  warnings: SimWarning[];
}

/**
 * Tarjan's strongly connected components, iterative so 200-node graphs never
 * hit the call-stack limit.
 */
function stronglyConnected(ids: string[], adjacency: Map<string, string[]>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  for (const root of ids) {
    if (index.has(root)) continue;
    const work: { id: string; next: number }[] = [{ id: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (!frame) break;
      const neighbours = adjacency.get(frame.id) ?? [];
      if (frame.next < neighbours.length) {
        const w = neighbours[frame.next];
        frame.next += 1;
        if (w === undefined) continue;
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter += 1;
          stack.push(w);
          onStack.add(w);
          work.push({ id: w, next: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.id, Math.min(low.get(frame.id) ?? 0, index.get(w) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.id, Math.min(low.get(parent.id) ?? 0, low.get(frame.id) ?? 0));
      if (low.get(frame.id) === index.get(frame.id)) {
        const component: string[] = [];
        let w: string | undefined;
        do {
          w = stack.pop();
          if (w === undefined) break;
          onStack.delete(w);
          component.push(w);
        } while (w !== frame.id);
        components.push(component);
      }
    }
  }
  return components;
}

/**
 * Split the graph into a simulable DAG and cyclic nodes. `isFlowNode` lets
 * out-of-band nodes (observability) stay off the traffic path.
 */
export function analyze(
  diagram: Diagram,
  entryId: string | undefined,
  isFlowNode: (nodeId: string) => boolean = () => true,
): GraphAnalysis {
  const ids = diagram.nodes.map((n) => n.id).filter(isFlowNode);
  const flow = new Set(ids);
  const outEdges = new Map<string, DiagramEdge[]>(ids.map((id) => [id, []]));
  const inEdges = new Map<string, DiagramEdge[]>(ids.map((id) => [id, []]));
  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of diagram.edges) {
    if (!flow.has(e.source) || !flow.has(e.target)) continue;
    outEdges.get(e.source)?.push(e);
    inEdges.get(e.target)?.push(e);
    adjacency.get(e.source)?.push(e.target);
  }

  const cyclic = new Set<string>();
  for (const component of stronglyConnected(ids, adjacency)) {
    const only = component[0];
    const selfLoop = only !== undefined && (adjacency.get(only) ?? []).includes(only);
    if (component.length > 1 || selfLoop) for (const id of component) cyclic.add(id);
  }

  const warnings: SimWarning[] = [...cyclic].map((nodeId) => ({
    code: 'CYCLE_UNSUPPORTED' as const,
    nodeId,
    message: 'Ciclo não suportado: este nó faz parte de um ciclo e não é simulado.',
  }));

  // Kahn's algorithm on the acyclic part.
  const indegree = new Map<string, number>();
  for (const id of ids) {
    if (cyclic.has(id)) continue;
    const incoming = (inEdges.get(id) ?? []).filter((e) => !cyclic.has(e.source));
    indegree.set(id, incoming.length);
  }
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const e of outEdges.get(id) ?? []) {
      if (cyclic.has(e.target)) continue;
      const left = (indegree.get(e.target) ?? 0) - 1;
      indegree.set(e.target, left);
      if (left === 0) ready.push(e.target);
    }
  }

  const depth = new Map<string, number>(ids.map((id) => [id, Number.POSITIVE_INFINITY]));
  if (entryId !== undefined && flow.has(entryId)) {
    depth.set(entryId, 0);
    const queue = [entryId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) break;
      const d = depth.get(id) ?? 0;
      for (const e of outEdges.get(id) ?? []) {
        if ((depth.get(e.target) ?? 0) > d + 1) {
          depth.set(e.target, d + 1);
          queue.push(e.target);
        }
      }
    }
  }

  return { order, cyclic, depth, outEdges, inEdges, warnings };
}

export interface Distribution {
  perEdge: Map<string, ClassRates>;
  warnings: SimWarning[];
}

const EPSILON = 1e-9;

/**
 * Split a node's output across its outgoing edges, class by class. Edges can
 * be restricted to classes; weights split the rest; unweighted edges share
 * what the weights leave (FR-11, FR-12).
 */
export function distribute(nodeId: string, out: ClassRates, edges: DiagramEdge[]): Distribution {
  const perEdge = new Map<string, ClassRates>(edges.map((e) => [e.id, {}]));
  const warnings: SimWarning[] = [];
  let warned = false;

  for (const [cls, rate] of Object.entries(out)) {
    const eligible = edges.filter((e) => e.classes === undefined || e.classes.includes(cls));
    if (eligible.length === 0) continue;

    const weighted = eligible.filter((e) => e.weight !== undefined);
    const unweighted = eligible.filter((e) => e.weight === undefined);
    const sumWeights = weighted.reduce((s, e) => s + (e.weight ?? 0), 0);

    const share = new Map<string, number>();
    for (const e of weighted) share.set(e.id, e.weight ?? 0);
    const rest = Math.max(0, 1 - sumWeights);
    for (const e of unweighted) share.set(e.id, rest / unweighted.length);

    let total = 0;
    for (const v of share.values()) total += v;
    if (total <= EPSILON) {
      for (const e of eligible) share.set(e.id, 1 / eligible.length);
      total = 1;
    }
    if (
      Math.abs(total - 1) > EPSILON ||
      (weighted.length > 0 && sumWeights <= EPSILON && unweighted.length === 0)
    ) {
      if (!warned) {
        warnings.push({
          code: 'WEIGHTS_NORMALIZED',
          nodeId,
          message: 'Os pesos das saídas não somam 100%; foram normalizados proporcionalmente.',
        });
        warned = true;
      }
    }

    for (const e of eligible) {
      const rates = perEdge.get(e.id);
      if (rates) rates[cls] = (rate * (share.get(e.id) ?? 0)) / total;
    }
  }
  return { perEdge, warnings };
}
