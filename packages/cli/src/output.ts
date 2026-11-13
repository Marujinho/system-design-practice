import type { Catalog } from '@archsim/catalog';
import type { CliOutput } from '@archsim/problems';
import type {
  Diagram,
  Finding,
  RequirementResult,
  ScoreResult,
  SimResult,
} from '@archsim/sim-engine';

/** Labels and names come from the user: they only ever appear under `userContent` (PRD §12 A05). */
export function userContent(
  diagram: Diagram,
  ids?: Record<string, string>,
): CliOutput['userContent'] {
  const labels: Record<string, string> = {};
  for (const n of diagram.nodes) labels[n.id] = n.label;
  return {
    labels,
    ...(diagram.name === undefined ? {} : { diagramName: diagram.name }),
    ...(ids === undefined ? {} : { ids }),
  };
}

/**
 * Node and edge ids are text the person chose. Rename them n1…, e1… so
 * nothing they wrote reaches the agent outside userContent (PRD §12 A05).
 */
export function neutralIds(diagram: Diagram): { diagram: Diagram; ids: Record<string, string> } {
  const map = new Map<string, string>();
  const ids: Record<string, string> = {};
  diagram.nodes.forEach((n, i) => {
    const id = `n${String(i + 1)}`;
    map.set(n.id, id);
    ids[id] = n.id;
  });
  return {
    ids,
    diagram: {
      ...diagram,
      nodes: diagram.nodes.map((n) => ({ ...n, id: map.get(n.id) ?? n.id })),
      edges: diagram.edges.map((e, i) => {
        const id = `e${String(i + 1)}`;
        ids[id] = e.id;
        return {
          ...e,
          id,
          source: map.get(e.source) ?? e.source,
          target: map.get(e.target) ?? e.target,
        };
      }),
    },
  };
}

export function summarize(args: {
  diagram: Diagram;
  catalog: Catalog;
  sim: SimResult;
  ticks: number;
  loadMultiplier: number;
  problemId?: string;
  requirements?: RequirementResult[];
  score?: ScoreResult;
  findings?: Finding[];
  ids?: Record<string, string>;
}): CliOutput {
  const nodes: CliOutput['nodes'] = {};
  for (const n of args.diagram.nodes) {
    const m = args.sim.nodes[n.id];
    if (!m) continue;
    nodes[n.id] = {
      serviceId: n.serviceId,
      kind: m.kind,
      rpsIn: m.rpsIn,
      rpsOut: m.rpsOut,
      errorRps: m.errorRps,
      errorRate: m.errorRate,
      utilization: m.utilization,
      capacity: m.capacity,
      p50: m.p50,
      p99: m.p99,
      costMonth: m.costMonth,
      ...(m.backlog === undefined ? {} : { backlog: m.backlog }),
      ...(m.queueAgeS === undefined ? {} : { queueAgeS: m.queueAgeS }),
      health: m.health,
    };
  }
  const out: CliOutput = {
    ticks: args.ticks,
    loadMultiplier: args.loadMultiplier,
    nodes,
    global: { ...args.sim.global },
    warnings: args.sim.warnings.map((w) => ({ ...w })),
    userContent: userContent(args.diagram, args.ids),
  };
  if (args.problemId !== undefined) out.problemId = args.problemId;
  if (args.requirements) out.requirements = args.requirements;
  if (args.score) {
    const s = args.score;
    out.score = {
      total: s.total,
      stars: s.stars,
      parts: s.parts,
      allPass: s.allPass,
      passAt15: s.passAt15,
      passAt2: s.passAt2,
      userCost: s.userCost,
      referenceCost: s.referenceCost,
      belowReference: s.belowReference,
    };
  }
  if (args.findings) out.findings = args.findings;
  return out;
}
