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
export function userContent(diagram: Diagram): CliOutput['userContent'] {
  const labels: Record<string, string> = {};
  for (const n of diagram.nodes) labels[n.id] = n.label;
  return diagram.name === undefined ? { labels } : { labels, diagramName: diagram.name };
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
    userContent: userContent(args.diagram),
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
