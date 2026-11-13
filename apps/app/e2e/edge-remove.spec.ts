import { expect, test, type Page } from '@playwright/test';
import { reference, seed, watchConsole } from './helpers';

/** A point along an edge's path, in page coordinates (0 = source, 1 = target). */
async function pointOn(page: Page, edgeId: string, at: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([id, t]) => {
      const path = document.querySelector<SVGPathElement>(
        `.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`,
      );
      const ctm = path?.getScreenCTM();
      if (!path || !ctm) throw new Error(`no path for ${id}`);
      const p = path.getPointAtLength(path.getTotalLength() * t);
      return { x: p.x * ctm.a + p.y * ctm.c + ctm.e, y: p.x * ctm.b + p.y * ctm.d + ctm.f };
    },
    [edgeId, at] as const,
  );
}

async function tabTo(page: Page, name: string, key: string, limit = 120): Promise<void> {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press(key);
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (label === name) return;
  }
  throw new Error(`não cheguei a "${name}" só com Tab`);
}

const EDGE = 'alb-app';

test('edges stay mounted while the simulation ticks (edge-hover T2a)', async ({ page }) => {
  await seed(page, 'archsim:free', reference('url-shortener'));
  await page.goto('/#/free');
  await expect(page.locator(`.react-flow__edge[data-id="${EDGE}"]`)).toBeVisible();
  const removed = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const root = document.querySelector('.react-flow__edges');
        if (!root) throw new Error('no edge layer');
        const obs = new MutationObserver((ms) => {
          for (const m of ms)
            for (const r of m.removedNodes)
              if (r instanceof Element && r.querySelector('.react-flow__edge')) n += 1;
        });
        obs.observe(root, { childList: true, subtree: true });
        setTimeout(() => {
          obs.disconnect();
          resolve(n);
        }, 1000);
      }),
  );
  expect(removed).toBe(0);
});

async function open(page: Page): Promise<void> {
  await seed(page, 'archsim:free', reference('url-shortener'));
  await page.goto('/#/free');
  await expect(page.locator(`.react-flow__edge[data-id="${EDGE}"]`)).toBeVisible();
  // the first result grows the nodes and moves the edges: hover after it
  await expect(page.getByRole('status', { name: 'Resultado global' })).toBeVisible();
}

test('hover an edge, click its ×: only that edge goes, and Cmd+Z brings it back (edge-hover G1–G3)', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await open(page);
  const edges = page.locator('.react-flow__edge');
  const nodes = page.locator('.service-node');
  const before = await edges.count();
  const nodeCount = await nodes.count();
  const remove = page.getByRole('button', { name: 'Remover conexão' });

  await expect(remove).toHaveCount(0);
  // The simulation re-renders the canvas 10×/s; retry the gesture until the click lands.
  await expect(async () => {
    const near = await pointOn(page, EDGE, 0.25);
    await page.mouse.move(near.x, near.y);
    await expect(remove).toBeVisible({ timeout: 1000 });
    // travel from the line to the button, which sits at the middle of the curve
    const box = await remove.boundingBox();
    if (!box) throw new Error('no button box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(edges).toHaveCount(before - 1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  await expect(page.locator(`.react-flow__edge[data-id="${EDGE}"]`)).toHaveCount(0);
  await expect(nodes).toHaveCount(nodeCount);

  await page.mouse.move(5, 5);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(edges).toHaveCount(before);
  await expect(page.locator(`.react-flow__edge[data-id="${EDGE}"]`)).toHaveCount(1);

  expect(problems).toEqual([]);
});

test('keyboard: a selected edge offers its × to Tab and Enter (edge-hover FR-5)', async ({
  page,
  browserName,
}) => {
  const problems = watchConsole(page);
  await open(page);
  const edges = page.locator('.react-flow__edge');
  const before = await edges.count();
  const selected = page.locator(`.react-flow__edge[data-id="${EDGE}"].selected`);

  await expect(async () => {
    const near = await pointOn(page, EDGE, 0.2);
    await page.mouse.click(near.x, near.y);
    await expect(selected).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  // move away: what keeps the button now is the selection, not the hover
  await page.mouse.move(5, 5);

  await tabTo(page, 'Remover conexão', browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await page.keyboard.press('Enter');
  await expect(edges).toHaveCount(before - 1);
  await expect(page.locator(`.react-flow__edge[data-id="${EDGE}"]`)).toHaveCount(0);

  expect(problems).toEqual([]);
});
