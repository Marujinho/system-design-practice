import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { reference, seed, watchConsole } from './helpers';

const PAGES = [
  ['início', '/#/'],
  ['lista de problemas', '/#/problems'],
  ['problema', '/#/problems/url-shortener'],
  ['canvas livre', '/#/free'],
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
