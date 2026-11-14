import { expect, test, type Page } from '@playwright/test';
import { reference, seed, watchConsole } from './helpers';

const viewport = (page: Page) =>
  page.locator('.react-flow__viewport').evaluate((el) => getComputedStyle(el).transform);

/** A point on the empty background, away from cards, panels and overlays. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const pane = await page.locator('.react-flow__pane').boundingBox();
  if (!pane) throw new Error('sem canvas');
  return { x: pane.x + 40, y: pane.y + 40 };
}

test.beforeEach(async ({ page }) => {
  await seed(page, 'archsim:free', reference('url-shortener'));
  await page.goto('/#/free');
  await expect(page.locator('.service-node')).toHaveCount(5);
  // fitView settles the view after the first paint: measure only once it stops moving
  let last = '';
  await expect
    .poll(async () => {
      const now = await viewport(page);
      const stable = now === last;
      last = now;
      return stable;
    })
    .toBe(true);
});

test('a plain drag on the background moves the view (mentor-edits FR-13)', async ({ page }) => {
  const problems = watchConsole(page);
  const before = await viewport(page);
  const at = await emptySpot(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 120, at.y + 60, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => viewport(page)).not.toBe(before);
  await expect(page.locator('.service-node.selected')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Shift + drag draws a selection box around cards', async ({ page }) => {
  const cards = page.locator('.service-node');
  const first = await cards.nth(1).boundingBox();
  const second = await cards.nth(2).boundingBox();
  if (!first || !second) throw new Error('sem cards');
  const from = { x: Math.min(first.x, second.x) - 20, y: Math.min(first.y, second.y) - 20 };
  const to = {
    x: Math.max(first.x + first.width, second.x + second.width) + 20,
    y: Math.max(first.y + first.height, second.y + second.height) + 20,
  };
  const before = await viewport(page);
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect
    .poll(() => page.locator('.react-flow__node.selected').count())
    .toBeGreaterThanOrEqual(2);
  expect(await viewport(page)).toBe(before);
});

test('dragging a card moves the card, not the view', async ({ page }) => {
  const card = page.locator('.react-flow__node').nth(1);
  const box = await card.boundingBox();
  if (!box) throw new Error('sem card');
  const before = await viewport(page);
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 50, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await card.boundingBox())?.x).not.toBe(box.x);
  expect(await viewport(page)).toBe(before);
});
