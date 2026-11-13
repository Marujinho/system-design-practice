export const PARTICLE_CAP = 2000;
const PER_DECADE = 3;

/** Particles for a rate: logarithmic, so 1M req/s does not become a smear (FR-29). */
export function particleCount(rps: number): number {
  if (!(rps > 0)) return 0;
  return Math.max(1, Math.round(PER_DECADE * Math.log10(1 + rps)));
}

/** Counts per edge, scaled down together when the total passes the cap. */
export function allocate(rates: readonly number[], cap = PARTICLE_CAP): number[] {
  const wanted = rates.map(particleCount);
  const total = wanted.reduce((a, b) => a + b, 0);
  if (total <= cap) return wanted;
  const scale = cap / total;
  const scaled = wanted.map((w) => Math.floor(w * scale));
  return scaled;
}

export type Point = { x: number; y: number };

/** React Flow's default bezier offset for a right→left connection. */
function offset(distance: number): number {
  return distance >= 0 ? 0.5 * distance : 0.25 * 25 * Math.sqrt(-distance);
}

/** A point at t ∈ [0, 1] on the bezier React Flow draws between a right handle and a left handle. */
export function bezierPoint(s: Point, t: Point, u: number): Point {
  const c1 = { x: s.x + offset(t.x - s.x), y: s.y };
  const c2 = { x: t.x - offset(t.x - s.x), y: t.y };
  const v = 1 - u;
  return {
    x: v * v * v * s.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * t.x,
    y: v * v * v * s.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * t.y,
  };
}

/** Edge stroke for the reduced-motion view: thickness grows with log(rps). */
export function staticStroke(rps: number): number {
  return rps > 0 ? Math.min(6, 1 + Math.log10(1 + rps) * 0.8) : 1;
}
