import { findService, findVariant, type Catalog } from '@archsim/catalog';
import type { ProposalOp } from '@archsim/problems';
import { LIMITS, overridableKeys, validateDiagram, type Diagram } from '@archsim/sim-engine';
import { produce } from 'immer';
import { defaultProtocol } from '../canvas/connection-rules';
import { freeSpot } from '../canvas/place';

/**
 * Applies a mentor's proposal to a diagram, all or nothing (mentor-edits FR-2,
 * FR-6, FR-7). Pure: the server runs it on the diagram the mentor saw, the
 * browser on the diagram on screen. The load has no operation, so it never
 * changes; the Users node can be connected from, never removed or edited.
 */
export type ApplyResult =
  { ok: true; diagram: Diagram } | { ok: false; code: 'missing' | 'invalid'; message: string };

export interface ApplyOptions {
  catalog: Catalog;
  /** A fresh node id for a service, unique in the diagram. */
  newId: (serviceId: string, index: number) => string;
  place?: (
    at: { x: number; y: number },
    taken: { x: number; y: number }[],
  ) => { x: number; y: number };
}

class Refused extends Error {
  constructor(
    readonly code: 'missing' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

const NEW_GAP_X = 220;

/** The id the browser gives a node a proposal creates: never like the store's own ids. */
export function proposalNodeId(serviceId: string, index: number): string {
  const name = serviceId.split('.')[1] ?? 'node';
  return `${name}-m${Date.now().toString(36)}${index.toString(36)}`;
}

export function applyProposal(
  diagram: Diagram,
  ops: readonly ProposalOp[],
  options: ApplyOptions,
): ApplyResult {
  const { catalog } = options;
  const place = options.place ?? freeSpot;
  const created = new Map<string, string>(); // novoN → real id
  try {
    const next = produce(diagram, (d) => {
      const nodeOf = (ref: string) => {
        const id = created.get(ref) ?? ref;
        const n = d.nodes.find((x) => x.id === id);
        if (!n) throw new Refused('missing', `o nó ${ref} não existe mais no desenho`);
        return n;
      };
      const editable = (ref: string) => {
        const n = nodeOf(ref);
        if (n.serviceId === 'core.users')
          throw new Refused('invalid', 'o nó Usuários não pode ser alterado nem removido');
        return n;
      };
      const serviceOf = (serviceId: string) => {
        const s = findService(catalog, serviceId);
        if (!s) throw new Refused('invalid', `serviço desconhecido: ${serviceId}`);
        return s;
      };

      ops.forEach((op, i) => {
        switch (op.op) {
          case 'add': {
            if (created.has(op.ref)) throw new Refused('invalid', `${op.ref} criado duas vezes`);
            const service = serviceOf(op.service);
            if (service.kind === 'entry')
              throw new Refused('invalid', 'o nó Usuários já existe e é único');
            const variant =
              op.variant === undefined ? service.variants[0] : findVariant(service, op.variant);
            if (!variant) throw new Refused('invalid', `tipo desconhecido: ${op.variant ?? ''}`);
            if (d.nodes.length >= LIMITS.maxNodes)
              throw new Refused('invalid', `o desenho já tem ${String(LIMITS.maxNodes)} nós`);
            const props: Record<string, number> = {};
            for (const [key, value] of Object.entries(op.props ?? {})) {
              const p = service.params.find((x) => x.key === key);
              if (!p || value < p.min || value > p.max)
                throw new Refused('invalid', `${service.label}: ${key} fora do permitido`);
              props[key] = value;
            }
            const id = options.newId(service.id, i);
            if (d.nodes.some((n) => n.id === id)) throw new Refused('invalid', 'id repetido');
            created.set(op.ref, id);
            d.nodes.push({
              id,
              serviceId: service.id,
              variantId: variant.id,
              position: { x: 0, y: 0 }, // placed once every operation is in
              label: op.label ?? service.label,
              props,
              overrides: {},
            });
            break;
          }
          case 'remove': {
            const n = editable(op.node);
            d.nodes = d.nodes.filter((x) => x.id !== n.id);
            d.edges = d.edges.filter((e) => e.source !== n.id && e.target !== n.id);
            break;
          }
          case 'connect': {
            const from = nodeOf(op.from);
            const to = nodeOf(op.to);
            if (from.id === to.id) throw new Refused('invalid', 'um nó não se conecta a si mesmo');
            if (d.edges.some((e) => e.source === from.id && e.target === to.id))
              throw new Refused('invalid', `${from.label} já está conectado a ${to.label}`);
            if (d.edges.length >= LIMITS.maxEdges)
              throw new Refused('invalid', `o desenho já tem ${String(LIMITS.maxEdges)} conexões`);
            const protocol = defaultProtocol(
              serviceOf(from.serviceId).kind,
              serviceOf(to.serviceId).kind,
            );
            d.edges.push({
              id: `e-${to.id}-${String(i)}-${from.id}`.slice(0, 64),
              source: from.id,
              target: to.id,
              protocol,
            });
            break;
          }
          case 'disconnect': {
            const from = nodeOf(op.from);
            const to = nodeOf(op.to);
            const before = d.edges.length;
            d.edges = d.edges.filter((e) => !(e.source === from.id && e.target === to.id));
            if (d.edges.length === before)
              throw new Refused('missing', `não há conexão de ${from.label} para ${to.label}`);
            break;
          }
          case 'set_variant': {
            const n = editable(op.node);
            const variant = findVariant(serviceOf(n.serviceId), op.variant);
            if (!variant) throw new Refused('invalid', `tipo desconhecido: ${op.variant}`);
            n.variantId = variant.id;
            const allowed = overridableKeys(variant);
            n.overrides = Object.fromEntries(
              Object.entries(n.overrides).filter(([k]) => allowed.has(k)),
            );
            break;
          }
          case 'set_prop': {
            const n = editable(op.node);
            const p = serviceOf(n.serviceId).params.find((x) => x.key === op.key);
            if (!p || op.value < p.min || op.value > p.max)
              throw new Refused('invalid', `${n.label}: ${op.key} fora do permitido`);
            n.props[op.key] = op.value;
            break;
          }
          case 'rename': {
            editable(op.node).label = op.label;
            break;
          }
        }
      });

      // New nodes go next to the node they hang from, on free ground (FR-10).
      const fresh = new Set(created.values());
      const taken = d.nodes.filter((n) => !fresh.has(n.id)).map((n) => n.position);
      const rightmost = taken.reduce((m, p) => Math.max(m, p.x), 0);
      for (const id of fresh) {
        const node = d.nodes.find((n) => n.id === id);
        if (!node) continue;
        const edge = d.edges.find(
          (e) =>
            (e.target === id || e.source === id) &&
            !fresh.has(e.target === id ? e.source : e.target),
        );
        const neighbour = edge
          ? d.nodes.find((n) => n.id === (edge.target === id ? edge.source : edge.target))
          : undefined;
        const at = neighbour
          ? {
              x: neighbour.position.x + (edge?.target === id ? NEW_GAP_X : -NEW_GAP_X),
              y: neighbour.position.y,
            }
          : { x: rightmost + NEW_GAP_X, y: 0 };
        node.position = place(at, taken);
        taken.push(node.position);
      }
    });
    const checked = validateDiagram(next, catalog);
    if (!checked.ok) return { ok: false, code: 'invalid', message: checked.message };
    return { ok: true, diagram: next };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** One line of the proposal card, in the names the person sees (FR-3). */
export function describeOp(
  op: ProposalOp,
  diagram: Diagram,
  ops: readonly ProposalOp[],
  catalog: Catalog,
): string {
  const serviceLabel = (id: string) => findService(catalog, id)?.label ?? id;
  const name = (ref: string): string => {
    const n = diagram.nodes.find((x) => x.id === ref);
    if (n) return `'${n.label}'`;
    const add = ops.find((o) => o.op === 'add' && o.ref === ref);
    if (add?.op === 'add') return `'${add.label ?? serviceLabel(add.service)}' (novo)`;
    return ref;
  };
  const nodeService = (ref: string) => {
    const n = diagram.nodes.find((x) => x.id === ref);
    return n ? findService(catalog, n.serviceId) : undefined;
  };
  switch (op.op) {
    case 'add': {
      const s = findService(catalog, op.service);
      const extras = [
        op.variant,
        ...Object.entries(op.props ?? {}).map(([k, v]) => {
          const p = s?.params.find((x) => x.key === k);
          return `${(p?.label ?? k).toLowerCase()} ${String(v)}`;
        }),
      ].filter((x) => x !== undefined);
      return `+ ${serviceLabel(op.service)} '${op.label ?? serviceLabel(op.service)}'${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`;
    }
    case 'remove':
      return `− remover ${name(op.node)}`;
    case 'connect':
      return `+ conexão ${name(op.from)} → ${name(op.to)}`;
    case 'disconnect':
      return `− conexão ${name(op.from)} → ${name(op.to)}`;
    case 'set_variant': {
      const n = diagram.nodes.find((x) => x.id === op.node);
      return `${name(op.node)}: tipo ${n ? `${n.variantId} → ` : ''}${op.variant}`;
    }
    case 'set_prop': {
      const s = nodeService(op.node);
      const p = s?.params.find((x) => x.key === op.key);
      const n = diagram.nodes.find((x) => x.id === op.node);
      const before = n ? (n.props[op.key] ?? p?.default) : undefined;
      return `${name(op.node)}: ${(p?.label ?? op.key).toLowerCase()} ${before === undefined ? '' : `${String(before)} → `}${String(op.value)}`;
    }
    case 'rename':
      return `${name(op.node)}: novo nome '${op.label}'`;
  }
}
