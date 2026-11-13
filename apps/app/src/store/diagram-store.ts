import { catalog, findService, findVariant } from '@archsim/catalog';
import {
  LIMITS,
  type Diagram,
  type DiagramEdge,
  type Load,
  type Protocol,
} from '@archsim/sim-engine';
import { produce } from 'immer';
import { create } from 'zustand';
import { emptyDiagram } from './defaults';
import { push, redo, undo, type History } from './history';

export type Mode = { kind: 'free' } | { kind: 'problem'; problemId: string };

export interface DiagramState {
  mode: Mode;
  diagram: Diagram;
  selection: string[];
  history: History;
  /** A one-line message for the user (a refused action); null when there is none. */
  notice: string | null;
  moving: boolean;

  start(mode: Mode, diagram: Diagram): void;
  addNode(serviceId: string, position: { x: number; y: number }): string | null;
  moveNodes(positions: Record<string, { x: number; y: number }>, done: boolean): void;
  select(ids: string[]): void;
  removeSelection(): void;
  connect(source: string, target: string, protocol: Protocol): string | null;
  setEdge(id: string, patch: Partial<Pick<DiagramEdge, 'protocol' | 'weight' | 'classes'>>): void;
  setLabel(nodeId: string, label: string): void;
  setVariant(nodeId: string, variantId: string): void;
  setProp(nodeId: string, key: string, value: number): boolean;
  setOverride(nodeId: string, key: string, value: number): void;
  resetOverride(nodeId: string, key: string): void;
  setLoad(load: Load): boolean;
  replaceDiagram(diagram: Diagram): void;
  undo(): void;
  redo(): void;
  dismissNotice(): void;
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

export const useDiagram = create<DiagramState>()((set, get) => {
  /** Apply a recorded change: snapshot first, so undo restores it. */
  const commit = (recipe: (d: Diagram) => void) => {
    const { diagram, history } = get();
    const next = produce(diagram, recipe);
    if (next === diagram) return;
    set({ diagram: next, history: push(history, diagram) });
  };

  return {
    mode: { kind: 'free' },
    diagram: emptyDiagram(),
    selection: [],
    history: { past: [], future: [] },
    notice: null,
    moving: false,

    start: (mode, diagram) => {
      set({
        mode,
        diagram,
        selection: [],
        history: { past: [], future: [] },
        notice: null,
        moving: false,
      });
    },

    addNode: (serviceId, position) => {
      const { diagram } = get();
      const service = findService(catalog, serviceId);
      const variant = service?.variants[0];
      if (!service || !variant) return null;
      if (diagram.nodes.length >= LIMITS.maxNodes) {
        set({ notice: `O diagrama já tem o máximo de ${LIMITS.maxNodes} nós.` });
        return null;
      }
      if (service.kind === 'entry' && diagram.nodes.some((n) => n.serviceId === serviceId)) {
        set({ notice: 'Só pode haver um nó de Usuários.' });
        return null;
      }
      const id = service.kind === 'entry' ? 'users' : newId(service.id.split('.')[1] ?? 'node');
      commit((d) => {
        d.nodes.push({
          id,
          serviceId,
          variantId: variant.id,
          position,
          label: service.label,
          props: {},
          overrides: {},
        });
      });
      set({ selection: [id] });
      return id;
    },

    moveNodes: (positions, done) => {
      const { diagram, history, moving } = get();
      const next = produce(diagram, (d) => {
        for (const n of d.nodes) {
          const p = positions[n.id];
          if (p) n.position = { x: p.x, y: p.y };
        }
      });
      // A whole drag is one undo step: snapshot only when the gesture starts.
      set({ diagram: next, history: moving ? history : push(history, diagram), moving: !done });
    },

    select: (ids) => {
      set({ selection: ids });
    },

    removeSelection: () => {
      const { selection, mode } = get();
      if (selection.length === 0) return;
      const ids = new Set(selection);
      commit((d) => {
        d.nodes = d.nodes.filter(
          (n) => !ids.has(n.id) || (mode.kind === 'problem' && n.serviceId === 'core.users'),
        );
        const alive = new Set(d.nodes.map((n) => n.id));
        d.edges = d.edges.filter(
          (e) => !ids.has(e.id) && alive.has(e.source) && alive.has(e.target),
        );
      });
      set({ selection: [] });
    },

    connect: (source, target, protocol) => {
      const { diagram } = get();
      if (source === target) return null;
      if (diagram.edges.length >= LIMITS.maxEdges) {
        set({ notice: `O diagrama já tem o máximo de ${LIMITS.maxEdges} conexões.` });
        return null;
      }
      if (diagram.edges.some((e) => e.source === source && e.target === target)) return null;
      const id = newId('e');
      commit((d) => {
        d.edges.push({ id, source, target, protocol });
      });
      return id;
    },

    setEdge: (id, patch) => {
      commit((d) => {
        const e = d.edges.find((x) => x.id === id);
        if (!e) return;
        if (patch.protocol !== undefined) e.protocol = patch.protocol;
        if ('weight' in patch) {
          if (patch.weight === undefined) delete e.weight;
          else e.weight = patch.weight;
        }
        if ('classes' in patch) {
          if (patch.classes === undefined || patch.classes.length === 0) delete e.classes;
          else e.classes = patch.classes;
        }
      });
    },

    setLabel: (nodeId, label) => {
      commit((d) => {
        const n = d.nodes.find((x) => x.id === nodeId);
        if (n) n.label = label.slice(0, LIMITS.maxLabel);
      });
    },

    setVariant: (nodeId, variantId) => {
      commit((d) => {
        const n = d.nodes.find((x) => x.id === nodeId);
        const service = n ? findService(catalog, n.serviceId) : undefined;
        if (n && service && findVariant(service, variantId)) n.variantId = variantId;
      });
    },

    setProp: (nodeId, key, value) => {
      const n = get().diagram.nodes.find((x) => x.id === nodeId);
      const param = n
        ? findService(catalog, n.serviceId)?.params.find((p) => p.key === key)
        : undefined;
      if (!param || !Number.isFinite(value) || value < param.min || value > param.max) return false;
      commit((d) => {
        const node = d.nodes.find((x) => x.id === nodeId);
        if (node) node.props[key] = value;
      });
      return true;
    },

    setOverride: (nodeId, key, value) => {
      if (!Number.isFinite(value) || value < 0) return;
      commit((d) => {
        const n = d.nodes.find((x) => x.id === nodeId);
        if (n) n.overrides[key] = value;
      });
    },

    resetOverride: (nodeId, key) => {
      commit((d) => {
        const n = d.nodes.find((x) => x.id === nodeId);
        if (n && key in n.overrides) {
          n.overrides = Object.fromEntries(Object.entries(n.overrides).filter(([k]) => k !== key));
        }
      });
    },

    setLoad: (load) => {
      if (get().mode.kind === 'problem') return false;
      commit((d) => {
        d.load = load;
      });
      return true;
    },

    replaceDiagram: (diagram) => {
      const { diagram: current, history } = get();
      set({ diagram, history: push(history, current), selection: [] });
    },

    undo: () => {
      const { history, diagram } = get();
      const r = undo(history, diagram);
      if (r) set({ diagram: r.diagram, history: r.history, selection: [] });
    },

    redo: () => {
      const { history, diagram } = get();
      const r = redo(history, diagram);
      if (r) set({ diagram: r.diagram, history: r.history, selection: [] });
    },

    dismissNotice: () => {
      set({ notice: null });
    },
  };
});
