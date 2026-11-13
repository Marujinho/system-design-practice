/**
 * Egress: a private block reaching out through one opening to two outside endpoints; the endpoint under the pointer rises.
 *
 * The pattern: one source and its destinations on a shared base. Dashed guides
 * on the base, painted before the plates, show where traffic goes (rule 06).
 * The destination under the pointer rises and goes bright, its neighbours
 * follow a little, staggered by distance; hits read each REST top (rule 01).
 */
import { HL } from '../vendor/kernel.js';

const { Cam, clamp, facing, fit, place, proj, prism, rings, seg, tween, tset, tval, tdone, disposer, mk, solid, put, pointer, register, reflect, unproj } = HL;

const BH = 3, LIFT = 12, M = 8;
const SRC = [0, 0, 26, 26, 18]; // [x0, y0, x1, y1, height]
const DST = [[58, 40, 16, 16, 12], [40, 58, 16, 16, 9]]; // [x, y, w, d, height] each
const all = [SRC, ...DST.map(([x, y, w, d, h]) => [x, y, x + w, y + d, h])];
const X0 = Math.min(...all.map((b) => b[0])) - M, Y0 = Math.min(...all.map((b) => b[1])) - M;
const X1 = Math.max(...all.map((b) => b[2])) + M, Y1 = Math.max(...all.map((b) => b[3])) + M;
const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let step = value;

  const C = Cam(45, 0.5, 2.06);
  const top = BH + Math.max(...all.map((b) => b[4])) + LIFT;
  fit(C, [[X0, Y0, 0], [X1, Y1, 0], [X1, Y0, 0], [X0, Y1, 0], [X0, Y0, top], [X1, Y0, top], [X0, Y1, top]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk('g', {}, svg);
  const [br, bi] = rings(X0, Y0, X1, Y1, 6, 1.4);
  reflect(svg, g, P, front, br, 0, 12);
  put(solid(g), prism(P, front, br, bi, 0, BH));

  // guides on the base, behind every plate
  const [sx, sy] = centre(SRC);
  for (const b of all.slice(1)) {
    const [tx, ty] = centre(b);
    mk('path', { d: seg(P(sx, sy, BH), P(tx, ty, BH)), class: 'nf dash' }, g);
  }

  // far to near, by ascending x + y (rule 06)
  const order = all.map((_, i) => i).sort((a, b) => centre(all[a])[0] + centre(all[a])[1] - (centre(all[b])[0] + centre(all[b])[1]));
  const boxes = [];
  for (const i of order) boxes[i] = { s: solid(g), z: tween(0) };
  const dot = mk('ellipse', { rx: 1.9, ry: 1.9, class: 'dot' }, boxes[0].s.g);
  let markAt = 0;

  const topOf = (i, z) => { const [cx, cy] = centre(all[i]); return P(cx, cy, BH + z + all[i][4]); };
  function draw(i, z) {
    const [x0, y0, x1, y1, h] = all[i];
    const [ring, inner] = rings(x0, y0, x1, y1, 4, 1);
    put(boxes[i].s, prism(P, front, ring, inner, BH + z, BH + z + h));
  }

  const last = all.map(() => NaN);
  const B = register(stage, (_dt, now) => {
    let moving = false;
    all.forEach((_, i) => {
      const z = tval(boxes[i].z, now);
      if (z !== last[i]) {
        draw(i, z);
        last[i] = z;
        if (i === markAt) place(dot, topOf(i, z));
      }
      if (!tdone(boxes[i].z, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  /** The nearest destination whose REST top lies under the point; the source answers nothing. */
  function hit([px, py]) {
    let best = -1, rank = -Infinity;
    for (let i = 1; i < all.length; i++) {
      const [x0, y0, x1, y1, h] = all[i];
      const [wx, wy] = unproj(C, px, py, BH + h);
      if (wx >= x0 - 2 && wx <= x1 + 2 && wy >= y0 - 2 && wy <= y1 + 2 && x0 + y0 > rank) { rank = x0 + y0; best = i; }
    }
    return best;
  }

  let act = -1;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    for (let i = 1; i < all.length; i++) {
      const d = from >= 0 ? Math.abs(i - from) : 0;
      tset(boxes[i].z, a < 0 ? 0 : d === 0 ? LIFT : d === 1 ? LIFT * 0.3 : 0, now, d * step);
      boxes[i].s.sil.classList.toggle('hi', i === a);
    }
    markAt = a >= 0 ? a : 0;
    boxes[markAt].s.g.append(dot);
    place(dot, topOf(markAt, tval(boxes[markAt].z, now)));
    read.textContent = a < 0 ? 'rest' : 'egress ' + String(a).padStart(2, '0');
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
  name: 'egress',
  means: 'A private block reaching two outside endpoints: the one under the pointer rises.',
  rules: [1, 2, 4, 5, 6, 8],
  range: [0, 45, 90],
  tour: [[150, 200], [210, 180], [260, 150], null],
  mount,
};
