import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { reference, seed, watchConsole } from './helpers';

const PAGES = [
  ['início', '/#/'],
  ['lista de problemas', '/#/problems'],
  ['problema', '/#/problems/url-shortener'],
  ['canvas livre', '/#/free'],
  ['estudo', '/#/problems/url-shortener/study'],
] as const;

for (const [name, url] of PAGES) {
  test(`no serious or critical accessibility violations: ${name} (NFR-6)`, async ({ page }) => {
    const problems = watchConsole(page);
    await seed(page, 'archsim:free', reference('url-shortener'));
    await page.goto(url);
    await page.waitForTimeout(1200);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes
            .slice(0, 2)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
      );
    expect(bad).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('no serious or critical accessibility violations: canvas livre recolhido (edge-hover NFR-2)', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await seed(page, 'archsim:free', reference('url-shortener'));
  await seed(page, 'archsim:layout', { palette: true, side: true, top: true, metrics: true });
  await page.goto('/#/free');
  await page.waitForTimeout(1200);
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
  expect(bad).toEqual([]);
  expect(problems).toEqual([]);
});

test('no serious or critical accessibility violations: estudo com o mentor aberto (study-mode NFR-5)', async ({
  page,
}) => {
  const problems = watchConsole(page);
  // its own problem, so the study flow's conversation never meets this one
  await page.goto('/#/problems/ticketing/study');
  await page.getByRole('button', { name: 'Abrir mentor' }).click();
  const log = page.getByRole('log', { name: 'Conversa com o mentor' });
  // with a conversation in it, whatever ran before (the fake provider answers)
  const question = page.getByRole('textbox', { name: 'Pergunta para o mentor' });
  for (let i = 0; i < 6; i += 1) {
    await question.fill(`Pergunta ${String(i)}: por onde eu começo?`);
    await question.press('Enter');
    await expect(log).toContainText(`Pergunta ${String(i)}`);
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
  }
  // and a proposal card (mentor-edits NFR-2)
  await question.fill('proponha:ec2');
  await question.press('Enter');
  await expect(page.getByRole('region', { name: 'Proposta do mentor' })).toBeVisible();
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes
          .slice(0, 2)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
  expect(bad).toEqual([]);
  expect(problems).toEqual([]);
});
