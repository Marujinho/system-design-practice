import { catalog } from '@archsim/catalog';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramEdge, DiagramNode } from './diagram';
import { initialState, step } from './step';

const services = catalog.services.filter((s) => s.kind !== 'entry');

const nodeArb = (i: number) =>
  fc
    .record({
      service: fc.constantFrom(...services),
      variantPick: fc.nat(),
      propPicks: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
        minLength: 4,
        maxLength: 4,
      }),
      overrideCap: fc.option(fc.double({ min: 0, max: 1e6, noNaN: true }), { nil: undefined }),
    })
    .map(({ service, variantPick, propPicks, overrideCap }): DiagramNode => {
      const variant =
        service.variants[variantPick % service.variants.length] ?? service.variants[0];
      const props: Record<string, number> = {};
      service.params.forEach((p, k) => {
        const t = propPicks[k % propPicks.length] ?? 0;
        props[p.key] = p.min + Math.round(((p.max - p.min) * t) / p.step) * p.step;
        props[p.key] = Math.min(p.max, Math.max(p.min, props[p.key] ?? p.min));
      });
      return {
        id: `n${i}`,
        serviceId: service.id,
        variantId: variant?.id ?? '',
        position: { x: 0, y: 0 },
        label: '',
        props,
        overrides: overrideCap === undefined ? {} : { capPerUnit: overrideCap },
      };
    });

const diagramArb = fc.integer({ min: 1, max: 200 }).chain((count) =>
  fc
    .tuple(
      fc.tuple(...Array.from({ length: count }, (_, i) => nodeArb(i + 1))),
      fc.array(
        fc.tuple(
          fc.nat(count),
          fc.nat(count),
          fc.option(fc.double({ min: 0, max: 1, noNaN: true })),
        ),
        {
          maxLength: Math.min(400, count * 2),
        },
      ),
      fc.double({ min: 0, max: 166_000, noNaN: true }),
      fc.double({ min: 0, max: 10_000, noNaN: true }),
    )
    .map(([nodes, pairs, rps, payload]): Diagram => {
      const all: DiagramNode[] = [
        {
          id: 'n0',
          serviceId: 'core.users',
          variantId: 'default',
          position: { x: 0, y: 0 },
          label: '',
          props: {},
          overrides: {},
        },
        ...nodes,
      ];
      const edges: DiagramEdge[] = pairs.map(([a, b, w], k) => ({
        id: `e${k}`,
        source: `n${a % all.length}`,
        target: `n${b % all.length}`,
        protocol: 'http',
        ...(w === null ? {} : { weight: w }),
      }));
      return {
        schemaVersion: 1,
        catalogVersion: catalog.catalogVersion,
        nodes: all,
        edges,
        load: {
          classes: [
            {
              name: 'read',
              label: 'r',
              mode: 'rps',
              op: 'read',
              rps,
              payloadKB: payload,
              cacheable: true,
            },
            {
              name: 'write',
              label: 'w',
              mode: 'rps',
              op: 'write',
              rps: rps / 10,
              payloadKB: 1,
              cacheable: false,
            },
          ],
        },
      };
    }),
);

function allFinite(value: unknown, path = ''): string | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? null : `${path}=${value}`;
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const bad = allFinite(v, `${path}.${k}`);
      if (bad) return bad;
    }
  }
  return null;
}

describe('NFR-4: metrics are always finite and non-negative', () => {
  it('holds for random graphs, parameters and loads', () => {
    fc.assert(
      fc.property(diagramArb, (d) => {
        let state = initialState();
        for (let t = 0; t < 3; t += 1) {
          const { state: next, result } = step(state, d, catalog, 100);
          state = next;
          const bad = allFinite({
            nodes: result.nodes,
            edges: result.edges,
            global: result.global,
          });
          if (bad) throw new Error(bad);
        }
        return true;
      }),
      { numRuns: 60 },
    );
    expect(true).toBe(true);
  });
});
