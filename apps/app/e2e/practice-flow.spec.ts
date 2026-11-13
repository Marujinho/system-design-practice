import { History, Session } from '@archsim/problems';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reference, seed, watchConsole, withUnits } from './helpers';

/** Each browser practices a different problem, so records from one run do not leak into the other. */
const PLAN = {
  chromium: {
    id: 'url-shortener',
    title: 'Encurtador de URL',
    node: 'app',
    label: 'API de redirecionamento',
    weak: 24,
    strong: 30,
  },
  webkit: {
    id: 'rate-limiter',
    title: 'Rate limiter distribuído',
    node: 'limiter',
    label: 'Gateway com limitador',
    weak: 12,
    strong: 15,
  },
} as const;

test('practice: statement only, finalize, score, record, session, solution', async ({
  page,
}, info) => {
  const plan = PLAN[info.project.name as keyof typeof PLAN];
  const problems = watchConsole(page);
  await seed(
    page,
    `archsim:problem:${plan.id}`,
    withUnits(reference(plan.id), plan.node, plan.weak),
  );

  await page.goto('/#/problems');
  await page.getByRole('link', { name: new RegExp(plan.title) }).click();
  await expect(page.getByRole('heading', { name: plan.title })).toBeVisible();
  await expect(page.getByText('Carga definida pelo problema.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver uma solução' })).toHaveCount(0);

  // first attempt: under-provisioned
  await page.getByRole('button', { name: 'Finalizar e pontuar' }).click();
  const first = page.getByRole('dialog', { name: 'Resultado' });
  await expect(first).toBeVisible();
  await expect(first.getByLabel(/^Score \d+ de 100$/)).toBeVisible();
  const firstScore = Number(
    (await first.getByLabel(/^Score \d+ de 100$/).getAttribute('aria-label'))?.match(/\d+/)?.[0],
  );
  await first.getByRole('button', { name: 'Continuar ajustando' }).click();

  // second attempt: scale the main fleet in the properties panel
  await page.getByRole('tab', { name: 'Propriedades' }).click();
  const units = page.getByLabel('Réplicas');
  // The node re-renders with every result (10/s); retry the click until it is selected.
  await expect(async () => {
    await page.locator('.service-node-label', { hasText: plan.label }).first().click();
    await expect(units).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await units.fill(String(plan.strong));
  await units.press('Enter');
  await page.getByRole('tab', { name: 'Requisitos' }).click();
  await page.getByRole('button', { name: 'Finalizar e pontuar' }).click();
  const second = page.getByRole('dialog', { name: 'Resultado' });
  const secondScore = Number(
    (await second.getByLabel(/^Score \d+ de 100$/).getAttribute('aria-label'))?.match(/\d+/)?.[0],
  );
  expect(secondScore).toBeGreaterThan(firstScore);
  await expect(second.getByText('novo recorde')).toBeVisible();
  await expect(second.getByText('Pode começar os follow-ups do ArchSim')).toBeVisible();

  // the session the agent will read
  const dir = process.env.ARCHSIM_PRACTICE_DIR ?? '';
  const session = Session.parse(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')));
  expect(session.problemId).toBe(plan.id);
  expect(session.score.total).toBe(secondScore);
  const history = History.parse(JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8')));
  expect(history.attempts.filter((a) => a.problemId === plan.id).length).toBeGreaterThanOrEqual(2);

  // the solution, read-only, does not change the user's diagram
  // let the debounced autosave of the last edit land first
  await page.waitForTimeout(800);
  const before = await page.evaluate((k) => localStorage.getItem(k), `archsim:problem:${plan.id}`);
  await second.getByRole('button', { name: 'Ver uma solução' }).click();
  await expect(page.getByRole('dialog', { name: /Uma solução/ })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), `archsim:problem:${plan.id}`)).toBe(
    before,
  );

  expect(problems).toEqual([]);
});
