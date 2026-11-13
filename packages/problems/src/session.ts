import type { Diagram, ScoreResult } from '@archsim/sim-engine';
import { Session } from './contracts';

/** The session file the app writes on "Finalizar e pontuar" and the agent reads (FR-47). */
export function buildSession(args: {
  problemId: string;
  diagram: Diagram;
  scored: ScoreResult;
  solutionSeen: boolean;
  readyAt: string;
}): Session {
  const s = args.scored;
  return Session.parse({
    schemaVersion: 1,
    problemId: args.problemId,
    status: 'ready',
    readyAt: args.readyAt,
    diagram: args.diagram,
    simulation: { global: { ...s.simulation.global } },
    score: {
      total: s.total,
      stars: s.stars,
      parts: s.parts,
      allPass: s.allPass,
      passAt15: s.passAt15,
      passAt2: s.passAt2,
      userCost: s.userCost,
      referenceCost: s.referenceCost,
      belowReference: s.belowReference,
      solutionSeen: args.solutionSeen,
    },
    requirements: s.requirements,
    findings: s.findings,
  });
}
