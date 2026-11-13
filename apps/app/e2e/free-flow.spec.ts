import { expect, test } from '@playwright/test';
import { reference, seed, watchConsole, withUnits } from './helpers';

test('free canvas: the under-provisioned API is the bottleneck, then recovers within two ticks (G4)', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await seed(page, 'archsim:free', withUnits(reference('url-shortener'), 'app', 8));
  await page.goto('/#/free');

  const api = page.locator('.service-node', { hasText: 'API de redirecionamento' });
  await expect(api.getByText('gargalo', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^gargalo: API de redirecionamento$/ }),
  ).toBeVisible();

  const units = page.getByLabel('Réplicas');
  // The node re-renders with every result (10/s); retry the click until it is selected.
  await expect(async () => {
    await api.locator('.service-node-label').click();
    await expect(units).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await units.fill('30');
  const started = Date.now();
  await units.press('Enter');
  await expect(api.getByText('saudável', { exact: true })).toBeVisible({ timeout: 2000 });
  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: 'G4', description: `${elapsed} ms até o estado mudar` });
  // two 100 ms ticks plus the worker round trip and a React render
  expect(elapsed).toBeLessThan(600);

  expect(problems).toEqual([]);
});

test('free canvas: adds a service from the palette and simulates it', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/#/free');
  await expect(page.getByText('Arraste um serviço ou comece por Usuários.')).toBeVisible();
  await page.getByRole('button', { name: 'Usuários / Internet' }).click();
  await page.getByRole('button', { name: 'EC2', exact: true }).click();
  await expect(page.locator('.service-node')).toHaveCount(2);
  expect(problems).toEqual([]);
});
