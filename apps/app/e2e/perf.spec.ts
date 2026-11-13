import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { perfDiagram } from '../../../packages/sim-engine/fixtures/perf-diagram';
import { seed } from './helpers';

test('50 nodes, 60 edges, 1M req/min: p95 frame time within 50 fps (NFR-2) @perf', async ({
  page,
}) => {
  await seed(page, 'archsim:free', perfDiagram());
  await page.goto('/#/free');
  await expect(page.locator('.service-node')).toHaveCount(50);
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const times: number[] = [];
        const start = performance.now();
        const tick = (t: number) => {
          times.push(t);
          if (t - start < 10_000) requestAnimationFrame(tick);
          else done(times);
        };
        requestAnimationFrame(tick);
      }),
  );
  const gaps = frames
    .slice(1)
    .map((t, i) => t - (frames[i] ?? t))
    .sort((a, b) => a - b);
  const p95 = gaps[Math.floor(gaps.length * 0.95)] ?? Infinity;
  const fps = 1000 / p95;
  writeFileSync(
    join(import.meta.dirname, 'perf-result.json'),
    `${JSON.stringify({ frames: frames.length, p95FrameMs: p95, p95Fps: fps }, null, 2)}\n`,
  );
  test.info().annotations.push({
    type: 'NFR-2',
    description: `p95 ${p95.toFixed(1)} ms/frame = ${fps.toFixed(1)} fps`,
  });
  expect(fps).toBeGreaterThanOrEqual(50);
});
