/**
 * Platters: three round volumes stacked like disks; the one under the pointer slides out.
 *
 * The pattern: discrete items stacked like drawers (Riffle's tweens). The
 * layer under the pointer slides out towards the viewer and its edge goes
 * bright; the rest ease back, staggered outwards from it. Layers keep their
 * bottom-to-top paint order, so a pulled one stays under the ones above
 * (rule 06). The hit test reads each layer's REST centre (rule 01).
 */
import { HL } from '../vendor/kernel.js';

const { Cam, clamp, facing, fit, place, proj, prism, rings, tween, tset, tval, tdone, disposer, mk, solid, put, pointer, register, reflect } = HL;

const W = 70, D = 70, GAP = 5, Z0 = 7, OUT = 22, R = 30;
const T = [12, 12, 12];
const REST = [2, 0, 4];
const N = T.length;
const zOf = (i) => Z0 + T.slice(0, i).reduce((s, t) => s + t + GAP, 0);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let step = value;

  const C = Cam(45, 0.5, 2.06);
  const top = zOf(N - 1) + T[N - 1];
  fit(C, [[-6, -6, 0], [W + 6, D + OUT + 6, 0], [W + 6, -6, top + 4], [-6, D + OUT, top]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk('g', {}, svg);
  const [pr, pi] = rings(-6, -6, W + 6, D + 6, R + 2, 1.6);
  reflect(svg, g, P, front, pr, 0, 12);
  put(solid(g), prism(P, front, pr, pi, 0, Z0 - 2));

  const layers = [];
  for (let i = 0; i < N; i++) {
    const grp = mk('g', {}, g);
    layers.push({ grp, s: solid(grp), y: tween(REST[i]) });
  }
  const dot = mk('ellipse', { rx: 1.7, ry: 1.7, class: 'dot' }, layers[N - 1].grp);
  let markAt = N - 1;
  const lightAt = (i, y) => P(W - 14, D + y, zOf(i) + T[i] / 2);

  function draw(i, y) {
    const [ring, inner] = rings(0, y, W, D + y, R, 1.2);
    put(layers[i].s, prism(P, front, ring, inner, zOf(i), zOf(i) + T[i]));
  }

  const last = new Array(N).fill(NaN);
  const B = register(stage, (_dt, now) => {
    let moving = false;
    layers.forEach((l, i) => {
      const y = tval(l.y, now);
      if (y !== last[i]) {
        draw(i, y);
        last[i] = y;
        if (i === markAt) place(dot, lightAt(i, y));
      }
      if (!tdone(l.y, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  // rest centres on screen, fixed
  const centres = layers.map((_, i) => P(W / 2, D / 2 + REST[i], zOf(i) + T[i] / 2));
  const left = P(0, D, 0)[0] - 20, right = P(W, 0, 0)[0] + 20;
  function hit([x, y]) {
    if (x < left || x > right) return -1;
    let best = -1, dist = Infinity;
    centres.forEach((c, i) => {
      const d = Math.abs(c[1] - y);
      if (d < dist) { dist = d; best = i; }
    });
    return dist < 26 ? best : -1;
  }

  let act = -1;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    layers.forEach((l, i) => {
      tset(l.y, a === i ? OUT : a < 0 ? REST[i] : 0, now, Math.abs(i - from) * step);
      l.s.sil.classList.toggle('hi', i === a);
    });
    markAt = a >= 0 ? a : N - 1;
    layers[markAt].grp.append(dot);
    place(dot, lightAt(markAt, tval(layers[markAt].y, now)));
    read.textContent = a < 0 ? 'rest' : 'vol ' + String(N - a).padStart(2, '0');
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
  name: 'platters',
  means: 'Three round volumes stacked like disks: the one under the pointer slides out.',
  rules: [1, 2, 4, 5, 6, 8],
  range: [0, 45, 90],
  tour: [[150, 200], [200, 150], [250, 110], null],
  mount,
};
