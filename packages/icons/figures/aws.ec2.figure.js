/**
 * Rack: a plinth holding five server blades stacked like drawers. The blade
 * under the pointer slides out towards the viewer and its edge goes bright;
 * the others ease back in, staggered outwards from it. At rest the blades sit
 * slightly uneven, and the top one's status light is the one bright mark.
 *
 * Blades keep their bottom-to-top paint order: a pulled blade's back stays
 * under the blades above it, like a drawer (rule 06).
 *
 * The pattern: discrete items (Riffle). Tweens on the 700ms lift curve, a
 * stagger by distance, and a hit test against each blade's REST centre, so a
 * blade sliding out from under the pointer cannot flip the choice (rule 01).
 */
import { HL } from '../vendor/kernel.js';

const { Cam, clamp, facing, fit, poly, proj, prism, rings, tween, tset, tval, tdone, disposer, mk, solid, put, place, pointer, register, reflect, rrect } = HL;

const N = 5, W = 96, D = 64, BH = 9, GAP = 5, Z0 = 7, OUT = 26;
const REST = [3, 0, 5, 1, 4];
const zOf = (i) => Z0 + i * (BH + GAP);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let step = value;

  const C = Cam(45, 0.5, 1.7);
  const top = zOf(N - 1) + BH;
  fit(C, [[-6, -6, 0], [W + 6, D + OUT + 6, 0], [W + 6, -6, top + 4], [-6, D + OUT, top]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk('g', {}, svg);
  const [pr, pi] = rings(-6, -6, W + 6, D + 6, 5, 1.6);
  reflect(svg, g, P, front, pr, 0, 12);
  put(solid(g), prism(P, front, pr, pi, 0, Z0 - 2));

  const blades = [];
  for (let i = 0; i < N; i++) {
    const grp = mk('g', {}, g);
    const s = solid(grp);
    const led = mk('ellipse', { rx: 1.6, ry: 1.6, class: i === N - 1 ? 'dot' : 'dot off' }, grp);
    const vent = mk('path', { class: 'nf lo' }, grp);
    blades.push({ grp, s, led, vent, y: tween(REST[i]) });
  }

  function draw(i, y) {
    const b = blades[i];
    const z = zOf(i);
    const [ring, inner] = rings(0, y, W, D + y, 3, 1.2);
    put(b.s, prism(P, front, ring, inner, z, z + BH));
    // the status light and a vent slot on the blade's front face (y = D + y)
    place(b.led, P(W - 10, D + y, z + BH / 2));
    const slot = rrect(12, z + 3, 52, z + BH - 3, 1.2, 3).map((q) => P(q.u, D + y, q.v));
    b.vent.setAttribute('d', poly(slot));
  }

  const last = new Array(N).fill(NaN);
  const B = register(stage, (_dt, now) => {
    let moving = false;
    blades.forEach((b, i) => {
      const y = tval(b.y, now);
      if (y !== last[i]) {
        draw(i, y);
        last[i] = y;
      }
      if (!tdone(b.y, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  // Rest centres on screen, fixed: the hit test never reads a moving pose.
  const centres = blades.map((_, i) => P(W / 2, D / 2 + REST[i], zOf(i) + BH / 2));
  const left = P(0, D, zOf(0))[0] - 20, right = P(W, 0, zOf(0))[0] + 20;
  function hit([x, y]) {
    if (x < left || x > right) return -1;
    let best = -1, dist = Infinity;
    centres.forEach((c, i) => {
      const d = Math.abs(c[1] - y);
      if (d < dist) { dist = d; best = i; }
    });
    return dist < BH * 2.4 ? best : -1;
  }

  let act = -1;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    blades.forEach((b, i) => {
      tset(b.y, a === i ? OUT : a < 0 ? REST[i] : 0, now, Math.abs(i - from) * step);
      b.s.sil.classList.toggle('hi', i === a);
      b.led.setAttribute('class', a < 0 ? (i === N - 1 ? 'dot' : 'dot off') : i === a ? 'dot' : 'dot off');
    });
    read.textContent = a < 0 ? 'rest' : `i-0${N - a}`;
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
  name: 'rack',
  means: 'Five server blades in a rack: the one under the pointer slides out towards you.',
  rules: [1, 2, 4, 5, 6, 8],
  range: [0, 45, 90],
  tour: [[150, 200], [200, 150], [250, 110], null],
  mount,
};
