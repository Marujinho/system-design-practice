import {
  findService,
  findVariant,
  type Catalog,
  type Service,
  type Variant,
} from '@archsim/catalog';
import type { Diagram, DiagramNode } from './diagram';
import { HOURS_PER_MONTH } from './queueing';
import type { RequirementResult } from './requirements';
import type { NodeMetrics, SimResult } from './step';

export type FindingType =
  | 'bottleneck'
  | 'requirement-failed'
  | 'overprovisioned'
  | 'no-traffic'
  | 'invalid-connection'
  | 'breaks-under-load';

export interface Finding {
  type: FindingType;
  nodeIds: string[];
  /** One sentence in Portuguese, for the result screen and the agent. */
  message: string;
  numbers: Record<string, number>;
  /** Ordering key: higher first. */
  impact: number;
}

export const OVERPROVISIONED = { maxRho: 0.25, minCostShare: 0.05, targetRho: 0.7 } as const;
/** Params that count interchangeable units, in the order they are tried. */
const UNIT_PARAMS = ['units', 'shards', 'prefixes'] as const;

const IMPACT = {
  bottleneck: 10_000,
  failed: 9_000,
  breaks15: 5_000,
  breaks2: 4_000,
  invalid: 100,
} as const;

function n(value: number, digits = 0): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function usd(value: number): string {
  return `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Ctx {
  diagram: Diagram;
  catalog: Catalog;
  at1: SimResult;
  at15: SimResult;
  at2: SimResult;
  requirements: RequirementResult[];
  req15: RequirementResult[];
  req2: RequirementResult[];
}

/**
 * Catalog label plus node id. Never the user's free-text label: findings reach
 * the agent, and user text must stay under `userContent` (PRD §12 A05).
 */
function nameOf(ctx: Ctx, nodeId: string): string {
  const node = ctx.diagram.nodes.find((x) => x.id === nodeId);
  if (!node) return nodeId;
  const service = findService(ctx.catalog, node.serviceId);
  return `${service?.label ?? node.serviceId} (${nodeId})`;
}

function metricsList(result: SimResult): NodeMetrics[] {
  return Object.values(result.nodes);
}

function requirementText(r: RequirementResult): string {
  return `${r.label} (medido ${n(r.measured, 2)} ${r.unit}, alvo ${r.op} ${n(r.target, 2)} ${r.unit})`;
}

/** The node that most explains a failing requirement. */
function culprit(ctx: Ctx, r: RequirementResult): NodeMetrics | undefined {
  const nodes = metricsList(ctx.at1).filter((m) => m.kind !== 'entry');
  const by = (key: (m: NodeMetrics) => number, pool = nodes) =>
    pool.reduce<NodeMetrics | undefined>(
      (best, m) => (best === undefined || key(m) > key(best) ? m : best),
      undefined,
    );
  switch (r.metric) {
    case 'p99': {
      const cls = r.class ?? '';
      return by(
        (m) => m.p99,
        nodes.filter((m) => (m.inByClass[cls] ?? 0) > 0),
      );
    }
    case 'throughput':
    case 'errorRate':
      return by((m) => m.errorRps);
    case 'costMonth':
      return by((m) => m.costMonth);
    case 'queueAge':
    case 'queueStable':
      return by(
        (m) => m.queueAgeS ?? -1,
        nodes.filter((m) => m.backlog !== undefined),
      );
  }
}

function hourly(variant: Variant): number {
  return variant.prices.filter((p) => p.per === 'unit-hour').reduce((s, p) => s + p.amountUsd, 0);
}

/** Estimated monthly saving from shrinking a lightly used node to ρ ≈ 0.7. */
function saving(
  node: DiagramNode,
  service: Service,
  variant: Variant,
  m: NodeMetrics,
): { saving: number; suggestion: string } | null {
  for (const key of UNIT_PARAMS) {
    const param = service.params.find((p) => p.key === key);
    if (!param) continue;
    const units = node.props[key] ?? param.default;
    const next = Math.max(
      param.min,
      Math.ceil((units * m.utilization) / OVERPROVISIONED.targetRho),
    );
    if (next >= units) return null;
    const perUnit = hourly(variant) * HOURS_PER_MONTH;
    return {
      saving: (units - next) * perUnit,
      suggestion: `reduzir ${param.label.toLowerCase()} de ${n(units)} para ${n(next)}`,
    };
  }
  const needed = m.rpsIn / OVERPROVISIONED.targetRho;
  const cheaper = service.variants
    .filter((v) => v.capPerUnit >= needed && hourly(v) < hourly(variant))
    .sort((a, b) => hourly(a) - hourly(b))[0];
  if (!cheaper) return null;
  return {
    saving: (hourly(variant) - hourly(cheaper)) * HOURS_PER_MONTH,
    suggestion: `trocar ${variant.id} por ${cheaper.id}`,
  };
}

function firstToSaturate(ctx: Ctx, result: SimResult): NodeMetrics | undefined {
  return metricsList(result)
    .filter((m) => m.kind !== 'entry' && (m.utilization > 1 || m.health === 'bottleneck'))
    .sort((a, b) => b.utilization - a.utilization)[0];
}

/** Explain a design: what breaks, why, and where money is wasted (FR-57). */
export function findings(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  const failing = ctx.requirements.filter((r) => !r.pass);
  const total = ctx.at1.global.costMonth;

  for (const m of metricsList(ctx.at1)) {
    if (m.kind === 'entry' || m.health !== 'bottleneck') continue;
    const queue = m.backlog !== undefined && m.utilization <= 1;
    const hits = failing.map((r) => r.label);
    out.push({
      type: 'bottleneck',
      nodeIds: [m.nodeId],
      message: queue
        ? `${nameOf(ctx, m.nodeId)} acumula fila: os consumidores não dão conta (backlog de ${n(m.backlog ?? 0)} mensagens).`
        : `${nameOf(ctx, m.nodeId)} recebe ${n(m.rpsIn)} req/s para ${n(m.capacity)} de capacidade (${n(m.utilization * 100)}%) e devolve ${n(m.errorRps)} erros/s${hits.length > 0 ? `; derruba: ${hits.join(', ')}` : ''}.`,
      numbers: {
        rpsIn: m.rpsIn,
        capacity: m.capacity,
        utilization: m.utilization,
        errorRps: m.errorRps,
      },
      impact: IMPACT.bottleneck + Math.min(m.utilization, 1e6),
    });
  }

  for (const r of failing) {
    const c = culprit(ctx, r);
    const ratio = r.target > 0 ? r.measured / r.target : r.measured;
    out.push({
      type: 'requirement-failed',
      nodeIds: c ? [c.nodeId] : [],
      message: `Requisito não atendido: ${requirementText(r)}${c ? `; quem mais pesa é ${nameOf(ctx, c.nodeId)}` : ''}.`,
      numbers: { measured: r.measured, target: r.target },
      impact: IMPACT.failed + Math.min(Math.abs(Math.log(Math.max(ratio, 1e-9))), 999),
    });
  }

  if (failing.length === 0) {
    const broken15 = !ctx.req15.every((r) => r.pass);
    const broken2 = !ctx.req2.every((r) => r.pass);
    const [result, multiplier, impact] = broken15
      ? [ctx.at15, 1.5, IMPACT.breaks15]
      : broken2
        ? [ctx.at2, 2, IMPACT.breaks2]
        : [undefined, 0, 0];
    if (result) {
      const first = firstToSaturate(ctx, result);
      out.push({
        type: 'breaks-under-load',
        nodeIds: first ? [first.nodeId] : [],
        message: `Com ${n(multiplier, 1)}× a carga, o design deixa de atender aos requisitos${first ? `; o primeiro a saturar é ${nameOf(ctx, first.nodeId)}` : ''}.`,
        numbers: { multiplier },
        impact,
      });
    }
  }

  for (const node of ctx.diagram.nodes) {
    const m = ctx.at1.nodes[node.id];
    const service = findService(ctx.catalog, node.serviceId);
    const variant = service ? findVariant(service, node.variantId) : undefined;
    if (!m || !service || !variant || service.kind === 'entry' || service.kind === 'observability')
      continue;

    if (m.rpsIn === 0 && m.costMonth > 0 && m.health !== 'unsimulated') {
      out.push({
        type: 'no-traffic',
        nodeIds: [node.id],
        message: `${nameOf(ctx, node.id)} não recebe tráfego e custa ${usd(m.costMonth)}/mês.`,
        numbers: { costMonth: m.costMonth },
        impact: m.costMonth,
      });
      continue;
    }
    if (
      m.rpsIn > 0 &&
      m.utilization < OVERPROVISIONED.maxRho &&
      total > 0 &&
      m.costMonth / total >= OVERPROVISIONED.minCostShare
    ) {
      const s = saving(node, service, variant, m);
      if (s && s.saving > 0) {
        out.push({
          type: 'overprovisioned',
          nodeIds: [node.id],
          message: `${nameOf(ctx, node.id)} trabalha a ${n(m.utilization * 100)}% e custa ${usd(m.costMonth)}/mês: dá para ${s.suggestion} e economizar cerca de ${usd(s.saving)}/mês.`,
          numbers: { utilization: m.utilization, costMonth: m.costMonth, saving: s.saving },
          impact: s.saving,
        });
      }
    }
  }

  for (const e of ctx.diagram.edges) {
    const source = ctx.diagram.nodes.find((x) => x.id === e.source);
    const target = ctx.diagram.nodes.find((x) => x.id === e.target);
    const s = source ? findService(ctx.catalog, source.serviceId) : undefined;
    const t = target ? findService(ctx.catalog, target.serviceId) : undefined;
    if (!s || !t || s.validTargetKinds.includes(t.kind)) continue;
    out.push({
      type: 'invalid-connection',
      nodeIds: [e.source, e.target],
      message: `A conexão ${nameOf(ctx, e.source)} → ${nameOf(ctx, e.target)} não é comum em ${s.label}; confira se é isso mesmo.`,
      numbers: {},
      impact: IMPACT.invalid,
    });
  }

  return out.sort((a, b) => b.impact - a.impact);
}
