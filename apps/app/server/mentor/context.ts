import { findService, findVariant, type Catalog } from '@archsim/catalog';
import { neutralIds, summarize } from '@archsim/cli/output';
import { scoreAttempt, withProblemLoad, type MentorMessage } from '@archsim/problems';
import type { LoadedProblem } from '@archsim/problems/load';
import { simulateSteady, type Diagram } from '@archsim/sim-engine';
import { MENTOR_PROMPT } from './prompt';

/** Tokens of history the mentor sees at most; older messages are left out, visibly (NFR-4). */
export const HISTORY_BUDGET_TOKENS = 60_000;
const SIM_TICKS = 600;

/** What the catalog says about each node's service, so quota and premise stay apart (FR-5). */
function catalogFacts(diagram: Diagram, catalog: Catalog) {
  const facts: Record<string, unknown> = {};
  for (const n of diagram.nodes) {
    const service = findService(catalog, n.serviceId);
    const variant = service ? findVariant(service, n.variantId) : undefined;
    if (!service || !variant) continue;
    facts[n.id] = {
      service: service.label,
      ...(service.fullName === undefined ? {} : { fullName: service.fullName }),
      type: variant.id,
      capacityPerUnit: { value: variant.capPerUnit, source: variant.capSource },
      limits: variant.limits.map((l) => ({
        label: l.label,
        value: l.value,
        unit: l.unit,
        source: l.source,
      })),
      props: n.props,
      ...(Object.keys(n.overrides).length === 0 ? {} : { overrides: n.overrides }),
    };
  }
  return facts;
}

/** The connections, in neutral ids, so the mentor knows the topology it may change (mentor-edits FR-1). */
function edgesOf(d: Diagram) {
  return d.edges.map((e) => ({ id: e.id, from: e.source, to: e.target, protocol: e.protocol }));
}

/**
 * What the mentor may add: every service with its types and editable params,
 * so a proposal names only things the simulator knows (mentor-edits FR-1, FR-6).
 */
function catalogDigest(catalog: Catalog) {
  return catalog.services
    .filter((s) => s.kind !== 'entry')
    .map((s) => ({
      id: s.id,
      label: s.label,
      ...(s.fullName === undefined ? {} : { fullName: s.fullName }),
      kind: s.kind,
      types: s.variants.map((v) => v.id),
      params: s.params.map((p) => ({ key: p.key, label: p.label, min: p.min, max: p.max })),
    }));
}

/** The engine's view of a diagram under the problem's load, with neutral ids (A05, A08). */
function engineView(loaded: LoadedProblem, diagram: Diagram, catalog: Catalog, scored: boolean) {
  const neutral = neutralIds(diagram);
  const d = withProblemLoad(neutral.diagram, loaded.problem);
  if (!scored) {
    const sim = simulateSteady(d, catalog, { ticks: SIM_TICKS });
    return {
      ...summarize({ diagram: d, catalog, sim, ticks: SIM_TICKS, loadMultiplier: 1 }),
      edges: edgesOf(d),
      catalog: catalogFacts(d, catalog),
    };
  }
  const score = scoreAttempt({
    problem: loaded.problem,
    reference: loaded.reference,
    diagram: d,
    catalog,
  });
  return {
    ...summarize({
      diagram: d,
      catalog,
      sim: score.simulation,
      ticks: SIM_TICKS,
      loadMultiplier: 1,
      problemId: loaded.problem.id,
      requirements: score.requirements,
      score,
      findings: score.findings,
    }),
    edges: edgesOf(d),
    catalog: catalogFacts(d, catalog),
  };
}

/**
 * The system prompt: the role, the problem and its reference solution. It only
 * changes with the problem, so the provider can cache it (study-mode FR-4, FR-11).
 */
export function systemPrompt(loaded: LoadedProblem, catalog: Catalog): string {
  const p = loaded.problem;
  const brief = {
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    statement: p.statement,
    functional: p.functional,
    quantitative: p.quantitative,
    load: p.load,
    qualitative: p.qualitative,
  };
  const reference = engineView(loaded, loaded.reference, catalog, false);
  return [
    MENTOR_PROMPT,
    `<enunciado>\n${JSON.stringify(brief, null, 2)}\n</enunciado>`,
    `<referencia>\nA solução de referência do problema, simulada com a carga dele:\n${JSON.stringify(reference)}\n</referencia>`,
    `<catalogo>\nOs serviços que existem no simulador, com os tipos e os parâmetros editáveis:\n${JSON.stringify(catalogDigest(catalog))}\n</catalogo>`,
  ].join('\n\n');
}

/**
 * The diagram on screen right now, recomputed on the server from the validated
 * diagram — never metrics sent by the browser (study-mode FR-4, A08). `ids`
 * maps the neutral ids the mentor sees back to the diagram's own, so a proposal
 * can be translated (mentor-edits §13).
 */
export function currentState(
  loaded: LoadedProblem,
  diagram: Diagram,
  catalog: Catalog,
): { text: string; ids: Record<string, string> } {
  const view = engineView(loaded, diagram, catalog, true);
  return {
    text: `<desenho_atual>\n${JSON.stringify(view)}\n</desenho_atual>`,
    ids: neutralIds(diagram).ids,
  };
}

/** A rough token count: about four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The most recent messages that fit the budget; `trimmed` when older ones were left out (NFR-4). */
export function trimHistory(
  messages: readonly MentorMessage[],
  budgetTokens = HISTORY_BUDGET_TOKENS,
): { kept: MentorMessage[]; trimmed: boolean } {
  const kept: MentorMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m === undefined) continue;
    const cost = estimateTokens(m.text);
    if (used + cost > budgetTokens) break;
    used += cost;
    kept.unshift(m);
  }
  // A conversation sent to the model starts with the person, never with the mentor.
  while (kept[0]?.role === 'mentor') kept.shift();
  return { kept, trimmed: kept.length < messages.length };
}
