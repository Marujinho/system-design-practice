import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { useSim } from '../sim/sim-store';
import { useDiagram } from '../store/diagram-store';
import { allocate, bezierPoint, type Point } from './particles';

const SPEED = 0.45; // path lengths per second

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v === '' ? fallback : v;
}

/**
 * Particles along every connection: density ∝ log(rps), red ones running back
 * for errors, at most 2,000 on screen (FR-29). Off under reduced motion.
 */
export function ParticleLayer({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const flow = useReactFlow();

  useEffect(() => {
    const canvas = ref.current;
    if (!enabled || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const started = performance.now();

    const handle = (id: string, side: 'out' | 'in'): Point | null => {
      const n = flow.getInternalNode(id);
      if (!n) return null;
      const w = n.measured.width ?? 0;
      const h = n.measured.height ?? 0;
      const p = n.internals.positionAbsolute;
      return flow.flowToScreenPosition({ x: side === 'out' ? p.x + w : p.x, y: p.y + h / 2 });
    };

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(rect.width * dpr) ||
        canvas.height !== Math.round(rect.height * dpr)
      ) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const result = useSim.getState().result;
      const running = useSim.getState().status === 'running';
      const edges = useDiagram.getState().diagram.edges;
      if (result && running) {
        const ok = edges.map((e) =>
          Math.max(0, (result.edges[e.id]?.rps ?? 0) - (result.edges[e.id]?.errorRps ?? 0)),
        );
        const bad = edges.map((e) => result.edges[e.id]?.errorRps ?? 0);
        const counts = allocate([...ok, ...bad]);
        const t = ((now - started) / 1000) * SPEED;
        const ink = cssVar('--hairline-hi', '#fafafa');
        const red = cssVar('--state-critical', '#ef4444');
        edges.forEach((e, i) => {
          const s = handle(e.source, 'out');
          const d = handle(e.target, 'in');
          if (!s || !d) return;
          const sx = { x: s.x - rect.left, y: s.y - rect.top };
          const dx = { x: d.x - rect.left, y: d.y - rect.top };
          for (const [n, color, reverse] of [
            [counts[i] ?? 0, ink, false],
            [counts[edges.length + i] ?? 0, red, true],
          ] as const) {
            ctx.fillStyle = color;
            for (let k = 0; k < n; k += 1) {
              const u = (t + k / n + i * 0.13) % 1;
              const p = bezierPoint(sx, dx, reverse ? 1 - u : u);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, flow]);

  return <canvas ref={ref} className="particles" aria-hidden="true" />;
}
