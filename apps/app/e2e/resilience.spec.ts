import { expect, test } from '@playwright/test';
import { reference, seed, watchConsole, withUnits } from './helpers';

test('a worker failure shows a banner and Reiniciar resumes with the diagram intact (NFR-5)', async ({
  page,
}) => {
  watchConsole(page);
  await seed(page, 'archsim:free', withUnits(reference('url-shortener'), 'app', 8));
  await page.goto('/#/free');
  const api = page.locator('.service-node', { hasText: 'API de redirecionamento' });
  await expect(api.getByText('gargalo', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __archsimForceWorkerError: () => void }).__archsimForceWorkerError();
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Simulação parou' })).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(page.getByText('Simulação parou')).toHaveCount(0);
  await expect(page.locator('.service-node')).toHaveCount(5);
  await expect(api.getByText('gargalo', { exact: true })).toBeVisible();
});

test('reduced motion: no animation loop, the state still reads (FR-31)', async ({ page }) => {
  watchConsole(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.__frames += 1;
      return raf(cb);
    };
  });
  await seed(page, 'archsim:free', withUnits(reference('url-shortener'), 'app', 8));
  await page.goto('/#/free');
  const api = page.locator('.service-node', { hasText: 'API de redirecionamento' });
  await expect(api.getByText('gargalo', { exact: true })).toBeVisible();

  const before = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  // Particles would ask for ~120 frames in 2 s; React Flow may ask for a handful.
  expect(after - before).toBeLessThan(15);
  expect(await page.locator('canvas.particles').count()).toBe(1);
  const animation = await api.evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
});
