import {
  findService,
  findVariant,
  type Catalog,
  type Kind,
  type Service,
  type Variant,
} from '@archsim/catalog';
import { rpsOf, type Diagram, type DiagramNode, type RequestClass } from './diagram';
import { analyze, distribute, type ClassRates } from './graph';
import { handlers, makeContext, type NodeContext, type NodeOutput, type NodeState } from './kinds';
import { add, sum } from './queueing';
import { healthOf, type NodeHealth } from './state';
import type { SimWarning } from './warnings';

export interface SimState {
  nodes: Record<string, NodeState>;
  elapsedMs: number;
}

export interface NodeMetrics {
  nodeId: string;
  kind: Kind | null;
  rpsIn: number;
  rpsOut: number;
  errorRps: number;
  /** errors / input, 0–1. */
  errorRate: number;
  utilization: number;
  capacity: number;
  p50: number;
  p99: number;
  costMonth: number;
  backlog?: number;
  queueAgeS?: number;
  health: NodeHealth;
  inByClass: ClassRates;
  errorsByClass: ClassRates;
}

export interface EdgeMetrics {
  edgeId: string;
  rps: number;
  byClass: ClassRates;
  /** Errors flowing back towards the source (for error particles). */
  errorRps: number;
}

export interface GlobalMetrics {
  rpsIn: number;
  errorRps: number;
  errorRate: number;
  costMonth: number;
  p50ByClass: Record<string, number>;
  p99ByClass: Record<string, number>;
  /** Entry rate minus errors, per class. */
  throughputByClass: Record<string, number>;
  bottleneckId: string | null;
}

export interface SimResult {
  elapsedMs: number;
  nodes: Record<string, NodeMetrics>;
  edges: Record<string, EdgeMetrics>;
  global: GlobalMetrics;
  warnings: SimWarning[];
}

export function initialState(): SimState {
  return { nodes: {}, elapsedMs: 0 };
}

interface Resolved {
  node: DiagramNode;
  service: Service;
  variant: Variant;
}

const BACKLOG_HISTORY = 4;

function resolve(diagram: Diagram, catalog: Catalog): Map<string, Resolved> {
  const out = new Map<string, Resolved>();
  for (const node of diagram.nodes) {
    const service = findService(catalog, node.serviceId);
    const variant = service ? findVariant(service, node.variantId) : undefined;
    if (service && variant) out.set(node.id, { node, service, variant });
  }
  return out;
}

/** Replace NaN/±Infinity by 0 and negatives by 0, noting it once per node. */
function guard(value: number, nodeId: string, warnings: SimWarning[], seen: Set<string>): number {
  if (Number.isFinite(value) && value >= 0) return value;
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_VALUE;
  if (!seen.has(nodeId)) {
    seen.add(nodeId);
    warnings.push({
      code: 'NUMERIC_GUARD',
      nodeId,
      message: 'Um valor numérico inválido foi substituído por 0 nesta simulação.',
    });
  }
  return 0;
}

function emptyOutput(): NodeOutput {
  return {
    processed: {},
    forward: {},
    errors: {},
    capacity: 0,
    utilization: 0,
    p50: 0,
    p99: 0,
    costMonth: 0,
    nextState: {},
    warnings: [],
  };
}

/**
 * Advance the simulation one tick. Pure: the same inputs give the same output,
 * and time only enters through `dtMs` (NFR-9).
 */
export function step(
  state: SimState,
  diagram: Diagram,
  catalog: Catalog,
  dtMs: number,
): { state: SimState; result: SimResult } {
  const resolved = resolve(diagram, catalog);
  const classes = new Map<string, RequestClass>(diagram.load.classes.map((c) => [c.name, c]));
  const entry = diagram.nodes.find((n) => resolved.get(n.id)?.service.kind === 'entry');
  const graph = analyze(diagram, entry?.id, (id) => {
    const kind = resolved.get(id)?.service.kind;
    return kind !== undefined && kind !== 'observability';
  });

  const warnings: SimWarning[] = [...graph.warnings];
  const guarded = new Set<string>();
  if (!entry) {
    warnings.push({ code: 'NO_ENTRY', message: 'Sem carga: adicione o nó Usuários.' });
  }

  const contexts = new Map<string, NodeContext>();
  const contextOf = (id: string): NodeContext | undefined => {
    const cached = contexts.get(id);
    if (cached) return cached;
    const r = resolved.get(id);
    if (!r) return undefined;
    const ctx = makeContext({
      node: r.node,
      service: r.service,
      variant: r.variant,
      classes,
      dtMs,
      state: state.nodes[id] ?? {},
      outDegree: graph.outEdges.get(id)?.length ?? 0,
      outKinds: (graph.outEdges.get(id) ?? []).flatMap((e) => {
        const kind = resolved.get(e.target)?.service.kind;
        return kind === undefined ? [] : [kind];
      }),
      downstreamCapacity: (graph.outEdges.get(id) ?? []).reduce((total, e) => {
        const target = resolved.get(e.target);
        if (!target || graph.cyclic.has(e.target)) return total;
        const h = handlers[target.service.kind];
        const targetCtx = makeContext({
          node: target.node,
          service: target.service,
          variant: target.variant,
          classes,
          dtMs,
          state: state.nodes[e.target] ?? {},
        });
        return total + h.capacity(targetCtx);
      }, 0),
    });
    contexts.set(id, ctx);
    return ctx;
  };

  const inputs = new Map<string, ClassRates>();
  if (entry) {
    const load: ClassRates = {};
    for (const c of diagram.load.classes) load[c.name] = rpsOf(c);
    inputs.set(entry.id, load);
  }

  const outputs = new Map<string, NodeOutput>();
  const edgeFlow = new Map<string, ClassRates>();
  const nextNodes: Record<string, NodeState> = {};

  const run = (id: string, input: ClassRates): NodeOutput => {
    const r = resolved.get(id);
    const ctx = contextOf(id);
    if (!r || !ctx) return emptyOutput();
    const h = handlers[r.service.kind];
    const out = h.process(input, ctx);
    warnings.push(...out.warnings);
    const next: NodeState = { ...out.nextState };
    if (out.backlog !== undefined) {
      const history = [...(state.nodes[id]?.backlogHistory ?? []), out.backlog];
      next.backlogHistory = history.slice(-BACKLOG_HISTORY);
    }
    nextNodes[id] = next;
    return out;
  };

  for (const id of graph.order) {
    const input = inputs.get(id) ?? {};
    const out = run(id, input);
    outputs.set(id, out);
    const edges = graph.outEdges.get(id) ?? [];
    if (out.fanout) {
      for (const e of edges) {
        const rates: ClassRates = {};
        for (const [cls, v] of Object.entries(out.forward)) {
          if (e.classes === undefined || e.classes.includes(cls)) rates[cls] = v;
        }
        edgeFlow.set(e.id, rates);
      }
    } else {
      const d = distribute(id, out.forward, edges);
      warnings.push(...d.warnings);
      for (const [edgeId, rates] of d.perEdge) edgeFlow.set(edgeId, rates);
    }
    for (const e of edges) {
      const rates = edgeFlow.get(e.id) ?? {};
      inputs.set(e.target, add(inputs.get(e.target) ?? {}, rates));
    }
  }

  // Nodes off the traffic path (observability) still cost money.
  for (const r of resolved.values()) {
    const id = r.node.id;
    if (outputs.has(id) || graph.cyclic.has(id)) continue;
    outputs.set(id, run(id, {}));
  }

  const nodes: Record<string, NodeMetrics> = {};
  for (const n of diagram.nodes) {
    const r = resolved.get(n.id);
    const out = outputs.get(n.id) ?? emptyOutput();
    const input = inputs.get(n.id) ?? {};
    const g = (v: number) => guard(v, n.id, warnings, guarded);
    const rpsIn = g(sum(input));
    const errorRps = g(sum(out.errors));
    const utilization = g(out.utilization);
    const backlog = out.backlog === undefined ? undefined : g(out.backlog);
    const history = nextNodes[n.id]?.backlogHistory ?? [];
    const metrics: NodeMetrics = {
      nodeId: n.id,
      kind: r?.service.kind ?? null,
      rpsIn,
      rpsOut: g(sum(out.forward)),
      errorRps,
      errorRate: rpsIn > 0 ? Math.min(1, errorRps / rpsIn) : 0,
      utilization,
      capacity: g(out.capacity),
      p50: g(out.p50),
      p99: g(out.p99),
      costMonth: g(out.costMonth),
      health: graph.cyclic.has(n.id) ? 'unsimulated' : healthOf(utilization, history),
      inByClass: input,
      errorsByClass: out.errors,
    };
    if (backlog !== undefined) metrics.backlog = backlog;
    if (out.queueAgeS !== undefined) metrics.queueAgeS = g(out.queueAgeS);
    nodes[n.id] = metrics;
  }

  const edges: Record<string, EdgeMetrics> = {};
  for (const e of diagram.edges) {
    const byClass = edgeFlow.get(e.id) ?? {};
    const rps = sum(byClass);
    const target = nodes[e.target];
    const errorRps = target && target.rpsIn > 0 ? (target.errorRps * rps) / target.rpsIn : 0;
    edges[e.id] = { edgeId: e.id, rps, byClass, errorRps };
  }

  const global = globals(diagram, graph.order, graph.depth, graph.inEdges, nodes, outputs, edges);

  return {
    state: { nodes: nextNodes, elapsedMs: state.elapsedMs + dtMs },
    result: { elapsedMs: state.elapsedMs + dtMs, nodes, edges, global, warnings },
  };
}

function globals(
  diagram: Diagram,
  order: string[],
  depth: Map<string, number>,
  inEdges: Map<string, { id: string; source: string }[]>,
  nodes: Record<string, NodeMetrics>,
  outputs: Map<string, NodeOutput>,
  edges: Record<string, EdgeMetrics>,
): GlobalMetrics {
  const classNames = diagram.load.classes.map((c) => c.name);
  const entryLoad: Record<string, number> = {};
  for (const c of diagram.load.classes) entryLoad[c.name] = rpsOf(c);
  const rpsIn = sum(entryLoad);

  let errorRps = 0;
  let costMonth = 0;
  const errorsByClass: Record<string, number> = {};
  for (const m of Object.values(nodes)) {
    errorRps += m.errorRps;
    costMonth += m.costMonth;
    for (const [cls, v] of Object.entries(m.errorsByClass))
      errorsByClass[cls] = (errorsByClass[cls] ?? 0) + v;
  }

  // Longest synchronous path per class (FR-27): a queue or stream ends the path.
  const p50ByClass: Record<string, number> = {};
  const p99ByClass: Record<string, number> = {};
  for (const cls of classNames) {
    const reach50 = new Map<string, number>();
    const reach99 = new Map<string, number>();
    let best50 = 0;
    let best99 = 0;
    for (const id of order) {
      const m = nodes[id];
      if (!m || (m.inByClass[cls] ?? 0) <= 0) continue;
      let arrive50: number | undefined;
      let arrive99: number | undefined;
      const incoming = inEdges.get(id) ?? [];
      if (incoming.length === 0) {
        arrive50 = 0;
        arrive99 = 0;
      }
      for (const e of incoming) {
        if ((edges[e.id]?.byClass[cls] ?? 0) <= 0) continue;
        const from50 = reach50.get(e.source);
        const from99 = reach99.get(e.source);
        if (from50 === undefined || from99 === undefined) continue;
        arrive50 = Math.max(arrive50 ?? 0, from50);
        arrive99 = Math.max(arrive99 ?? 0, from99);
      }
      if (arrive50 === undefined || arrive99 === undefined) continue;
      const at50 = arrive50 + m.p50;
      const at99 = arrive99 + m.p99;
      best50 = Math.max(best50, at50);
      best99 = Math.max(best99, at99);
      if (!outputs.get(id)?.asyncBoundary) {
        reach50.set(id, at50);
        reach99.set(id, at99);
      }
    }
    p50ByClass[cls] = best50;
    p99ByClass[cls] = best99;
  }

  const throughputByClass: Record<string, number> = {};
  for (const cls of classNames) {
    throughputByClass[cls] = Math.max(0, (entryLoad[cls] ?? 0) - (errorsByClass[cls] ?? 0));
  }

  let bottleneckId: string | null = null;
  let bestRho = 0;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const id of order) {
    const m = nodes[id];
    if (!m || m.rpsIn <= 0) continue;
    const d = depth.get(id) ?? Number.POSITIVE_INFINITY;
    if (
      m.utilization > bestRho ||
      (m.utilization === bestRho && d < bestDepth && bottleneckId !== null)
    ) {
      bestRho = m.utilization;
      bestDepth = d;
      bottleneckId = id;
    }
  }

  return {
    rpsIn,
    errorRps,
    errorRate: rpsIn > 0 ? Math.min(1, errorRps / rpsIn) : 0,
    costMonth,
    p50ByClass,
    p99ByClass,
    throughputByClass,
    bottleneckId,
  };
}
