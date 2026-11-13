/**
 * Partitions: a grid of low key ranges, one hot partition standing taller; the one under the pointer rises.
 *
 * The pattern: discrete items on a base (Terrain's grid, Riffle's tweens). The
 * cell under the pointer rises and goes bright, its neighbours rise a little,
 * staggered by distance; the hit test reads each cell's REST top (rule 01).
 */
import { HL } from '../vendor/kernel.js';

const { Cam, clamp, facing, fit, place, proj, prism, rings, tween, tset, tval, tdone, disposer, mk, solid, put, pointer, register, reflect, unproj } = HL;

const ROWS = 4, COLS = 4, CW = 11, CD = 11, GAP = 3, M = 7, BH = 3, LIFT = 10;
const H = [4, 5, 4, 6, 5, 4, 14, 5, 6, 5, 4, 5, 4, 6, 5, 4];
const MARK = 6;
const W = COLS * CW + (COLS - 1) * GAP, D = ROWS * CD + (ROWS - 1) * GAP;
const at = (i) => [(i % COLS) * (CW + GAP), Math.floor(i / COLS) * (CD + GAP)];
const dist = (i, j) => Math.max(Math.abs((i % COLS) - (j % COLS)), Math.abs(Math.floor(i / COLS) - Math.floor(j / COLS)));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let step = value;

  const C = Cam(45, 0.5, 2.77);
  const top = BH + Math.max(...H) + LIFT;
  fit(C, [[-M, -M, 0], [W + M, D + M, 0], [W + M, -M, 0], [-M, D + M, 0], [0, 0, top], [W, 0, top], [0, D, top]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk('g', {}, svg);
  const [br, bi] = rings(-M, -M, W + M, D + M, 6, 1.4);
  reflect(svg, g, P, front, br, 0, 12);
  put(solid(g), prism(P, front, br, bi, 0, BH));

  // far to near, by ascending x + y (rule 06)
  const order = H.map((_, i) => i).sort((a, b) => at(a)[0] + at(a)[1] - (at(b)[0] + at(b)[1]));
  const cells = [];
  for (const i of order) cells[i] = { s: solid(g), z: tween(0) };
  const dot = mk('ellipse', { rx: 1.9, ry: 1.9, class: 'dot' }, cells[MARK].s.g);
  let markAt = MARK;

  const topOf = (i, z) => { const [x, y] = at(i); return P(x + CW / 2, y + CD / 2, BH + z + H[i]); };
  function draw(i, z) {
    const [x, y] = at(i);
    const [ring, inner] = rings(x, y, x + CW, y + CD, 2, 1);
    put(cells[i].s, prism(P, front, ring, inner, BH + z, BH + z + H[i]));
  }

  const last = H.map(() => NaN);
  const B = register(stage, (_dt, now) => {
    let moving = false;
    H.forEach((_, i) => {
      const z = tval(cells[i].z, now);
      if (z !== last[i]) {
        draw(i, z);
        last[i] = z;
        if (i === markAt) place(dot, topOf(i, z));
      }
      if (!tdone(cells[i].z, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  /** The nearest cell whose REST top lies under the point. */
  function hit([sx, sy]) {
    let best = -1, rank = -Infinity;
    H.forEach((h, i) => {
      const [x, y] = at(i);
      const [wx, wy] = unproj(C, sx, sy, BH + h);
      const inside = wx >= x - GAP / 2 && wx <= x + CW + GAP / 2 && wy >= y - GAP / 2 && wy <= y + CD + GAP / 2;
      if (inside && x + y > rank) { rank = x + y; best = i; }
    });
    return best;
  }

  let act = -1;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    H.forEach((_, i) => {
      const d = from >= 0 ? dist(i, from) : 0;
      const lift = a < 0 ? 0 : d === 0 ? LIFT : d === 1 ? LIFT * 0.3 : 0;
      tset(cells[i].z, lift, now, d * step);
      cells[i].s.sil.classList.toggle('hi', i === a);
    });
    markAt = a >= 0 ? a : MARK;
    cells[markAt].s.g.append(dot);
    place(dot, topOf(markAt, tval(cells[markAt].z, now)));
    read.textContent = a < 0 ? 'rest' : 'part ' + String(a + 1).padStart(2, '0');
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());
  read.textContent = 'rest';

  return {
    set: (v) => { step = clamp(v, 0, 90); },
    destroy: bag.dispose,
  };
}

export default {
  name: 'partitions',
  means: 'A grid of partitions with one hot key standing tall: the one under the pointer rises.',
  rules: [1, 2, 3, 4, 5, 6, 8],
  range: [0, 45, 90],
  tour: [[150, 190], [200, 150], [250, 130], null],
  mount,
};
