const STEP_X = 170;
const STEP_Y = 30;

/** The first spot near `at` that no node already occupies, stepping right (and a little down). */
export function freeSpot(
  at: { x: number; y: number },
  taken: { x: number; y: number }[],
): { x: number; y: number } {
  for (let k = 0; k < 50; k += 1) {
    const p = { x: at.x + k * STEP_X, y: at.y + k * STEP_Y };
    const near = (t: { x: number; y: number }) =>
      Math.abs(t.x - p.x) < STEP_X / 2 && Math.abs(t.y - p.y) < STEP_X / 2;
    if (!taken.some(near)) return p;
  }
  return at;
}
