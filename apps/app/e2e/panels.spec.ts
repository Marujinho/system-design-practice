import { expect, test, type Page } from '@playwright/test';
import { reference, seed, watchConsole } from './helpers';

const PANEL_KEYS = ['palette', 'side', 'top', 'metrics'];

async function area(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return box.width * box.height;
}

test.beforeEach(async ({ page }) => {
  await seed(page, 'archsim:free', reference('url-shortener'));
});

test('focus the canvas: it takes the workspace, then the panels come back (edge-hover G4, FR-12)', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/free');
  await expect(page.getByRole('status', { name: 'Resultado global' })).toBeVisible();
  const before = await area(page, '.canvas');

  await page.getByRole('button', { name: 'Focar no canvas' }).click();
  await expect(page.getByRole('button', { name: 'Expandir paleta' })).toBeVisible();
  const canvas = await area(page, '.canvas');
  const workspace = await area(page, '.workspace');
  const ofViewport = canvas / (1440 * 900);
  test.info().annotations.push({
    type: 'G4',
    description: `canvas ${Math.round(before)} → ${Math.round(canvas)} px²; ${(100 * (canvas / workspace)).toFixed(1)}% da área de trabalho, ${(100 * ofViewport).toFixed(1)}% da janela (o cabeçalho do app não recolhe)`,
  });
  expect(canvas / workspace).toBeGreaterThanOrEqual(0.9);

  await page.getByRole('button', { name: 'Restaurar painéis' }).click();
  await expect(page.getByRole('button', { name: 'Recolher paleta' })).toBeVisible();
  expect(await area(page, '.canvas')).toBeCloseTo(before, -2);
  expect(problems).toEqual([]);
});

test('a collapsed panel stays collapsed after a reload (edge-hover G5, FR-13)', async ({
  page,
}) => {
  await page.goto('/#/free');
  await page.getByRole('button', { name: 'Recolher paleta' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir paleta' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar serviço' })).toBeHidden();
});

test('collapsing a panel keeps the zoom and the viewport (edge-hover FR-16)', async ({ page }) => {
  await page.goto('/#/free');
  await expect(page.getByRole('status', { name: 'Resultado global' })).toBeVisible();
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await page.getByRole('button', { name: 'Recolher paleta' }).click();
  await page.getByRole('button', { name: 'Recolher painel lateral' }).click();
  await page.waitForTimeout(300);
  expect(await viewport.getAttribute('style')).toBe(before);
});

test('the problem title stays on the collapsed top strip (edge-hover FR-10)', async ({ page }) => {
  await page.goto('/#/problems/url-shortener');
  await expect(page.getByRole('heading', { name: 'Encurtador de URL' })).toBeVisible();
  await page.getByRole('button', { name: 'Recolher barra superior' }).click();
  await expect(page.locator('.collapsible-top.collapsed')).toContainText('Encurtador de URL');
  const strip = await page.locator('.collapsible-top').boundingBox();
  expect(strip?.height).toBeLessThanOrEqual(33);
});

test('the panel layout never lands in the saved diagram (edge-hover A08)', async ({ page }) => {
  await page.goto('/#/free');
  await page.getByRole('button', { name: 'Recolher painel lateral' }).click();
  await page.getByRole('button', { name: 'EC2', exact: true }).click();
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('archsim:free') ?? ''))
    .toContain('aws.ec2');
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('archsim:free') ?? '{}') as Record<string, unknown>,
  );
  for (const k of PANEL_KEYS) expect(saved).not.toHaveProperty(k);
  const layout = await page.evaluate(() => localStorage.getItem('archsim:layout'));
  expect(layout).toContain('"side":true');
});
