import { expect, test, type Page } from '@playwright/test';
import { inLanguage, portugueseLeftovers, watchConsole } from './helpers';

/** A problem per browser that no other spec finalizes, so records never meet. */
const PROBLEM = { chromium: 'news-feed', webkit: 'ticketing' } as const;

const idOf = (name: string) => PROBLEM[name as keyof typeof PROBLEM];

async function settle(page: Page) {
  // two simulation results, so the cards and the global bar carry numbers
  await page.waitForTimeout(400);
}

test('English everywhere: no Portuguese left outside what people wrote (language-switch FR-5, FR-11)', async ({
  page,
}, info) => {
  const id = idOf(info.project.name);
  const problems = watchConsole(page);
  await inLanguage(page, 'en');
  const leftovers: Record<string, string[]> = {};
  const scan = async (where: string) => {
    await settle(page);
    const found = await portugueseLeftovers(page);
    if (found.length > 0) leftovers[where] = found;
  };

  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Practice system design');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await scan('home');

  await page.goto('/#/problems');
  await expect(page.getByRole('heading', { name: 'Problems' })).toBeVisible();
  await scan('problem list');

  // a problem: statement, three services added from the palette, properties of each
  await page.goto(`/#/problems/${id}`);
  await expect(page.getByText('Load set by the problem.')).toBeVisible();
  for (const name of ['EC2', 'ElastiCache', 'SQS']) {
    await page.getByRole('searchbox', { name: 'Search services' }).fill(name);
    await page.locator('.palette-item').first().click();
  }
  await page.getByRole('searchbox', { name: 'Search services' }).fill('');
  await scan('problem');
  await page.getByRole('tab', { name: 'Properties' }).click();
  // new cards land under the minimap: select them with the node's own click handler
  for (const card of await page.locator('.react-flow__node').all()) {
    await card.dispatchEvent('click');
    await scan('properties');
  }

  // finish and read the result
  await page.getByRole('tab', { name: 'Requirements' }).click();
  await page.getByRole('button', { name: 'Finish and score' }).click();
  const result = page.getByRole('dialog', { name: 'Result' });
  await expect(result).toBeVisible();
  await expect(result.getByLabel(/^Score \d+ of 100$/)).toBeVisible();
  await scan('result');
  await result.getByRole('button', { name: 'See a solution' }).click();
  await expect(page.locator('#solution-title')).toContainText('A solution');
  await scan('solution');

  // study with the mentor open (scripted provider), from an empty conversation
  const cleared = await page.request.delete(`/__archsim/conversation/${id}`, {
    headers: { origin: 'http://127.0.0.1:4173' },
  });
  expect(cleared.status()).toBe(204);
  await page.goto(`/#/problems/${id}/study`);
  await page.getByRole('button', { name: 'Open mentor' }).click();
  const question = page.getByRole('textbox', { name: 'Question for the mentor' });
  await expect(question).toBeVisible();
  await scan('study with the mentor');
  // a scripted reply with a proposal: the card's chrome is the app's, the summary is the mentor's
  await question.fill('proponha:ec2');
  await question.press('Enter');
  const card = page.getByRole('region', { name: "The mentor's proposal" });
  await expect(card).toContainText('+ connection');
  await scan('proposal card');
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card).toContainText('applied');
  await scan('applied proposal');

  // the free canvas, created in English
  await page.goto('/#/free');
  await page.getByRole('searchbox', { name: 'Search services' }).fill('Lambda');
  await page.locator('.palette-item').first().click();
  await scan('free canvas');

  expect(leftovers).toEqual({});
  expect(problems).toEqual([]);
});

test('the scan catches Portuguese that slips in (FR-11, negative)', async ({ page }) => {
  await inLanguage(page, 'en');
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  expect(await portugueseLeftovers(page)).toEqual([]);
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'isto não funciona';
    document.querySelector('main')?.append(p);
    document.querySelector('h1 a')?.setAttribute('title', 'Voltar ao início');
    // app texts with no accent and no listed word: caught because they are in pt.ts
    for (const text of ['Pausar', 'Conquistas']) {
      const b = document.createElement('button');
      b.textContent = text;
      document.querySelector('main')?.append(b);
    }
  });
  expect(await portugueseLeftovers(page)).toEqual([
    'isto não funciona',
    'Pausar',
    'Conquistas',
    'title="Voltar ao início"',
  ]);
});

test('switching mid-problem keeps the diagram, the selection and the simulation, at once, and is remembered (FR-2, FR-3, NFR-1)', async ({
  page,
}, info) => {
  const id = idOf(info.project.name);
  const problems = watchConsole(page);
  // no stored choice: the pt-BR browser opens in Portuguese (FR-4); the switch is what gets stored
  await page.goto(`/#/problems/${id}`);
  await expect(page.getByText('Carga definida pelo problema.')).toBeVisible();
  for (const name of ['EC2', 'DynamoDB']) {
    await page.getByRole('searchbox', { name: 'Buscar serviço' }).fill(name);
    await page.locator('.palette-item').first().click();
  }
  await page.getByRole('tab', { name: 'Propriedades' }).click();
  await page.locator('.react-flow__node').nth(1).dispatchEvent('click');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await settle(page);
  const url = page.url();
  const before = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.service-node').length,
    selected: document.querySelector('.react-flow__node.selected')?.getAttribute('data-id'),
    name: document.querySelector<HTMLInputElement>('.panel input')?.value,
  }));
  expect(before.selected).toBeTruthy();

  // from the click to the new texts on screen, measured inside the page, frame by frame
  const ms = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const en = [...document.querySelectorAll('.lang-toggle button')].find(
          (b) => b.textContent === 'EN',
        ) as HTMLButtonElement;
        const t0 = performance.now();
        en.click();
        const poll = () => {
          const elapsed = performance.now() - t0;
          if (document.body.innerText.includes('Load set by the problem.')) resolve(elapsed);
          else if (elapsed > 1000) resolve(Number.POSITIVE_INFINITY);
          else requestAnimationFrame(poll);
        };
        poll();
      }),
  );
  expect(ms).toBeLessThan(100);
  await expect(page.getByRole('tab', { name: 'Properties' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const after = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.service-node').length,
    selected: document.querySelector('.react-flow__node.selected')?.getAttribute('data-id'),
    name: document.querySelector<HTMLInputElement>('.panel input')?.value,
  }));
  expect(after).toEqual(before);
  expect(page.url()).toBe(url);
  // the simulation keeps going: the global bar still shows numbers, now in English
  await expect(page.getByRole('status', { name: 'Overall result' })).toContainText('/month');

  // once autosave (500 ms) has kept the draft
  await expect
    .poll(() =>
      page.evaluate(
        (k) =>
          (JSON.parse(localStorage.getItem(k) ?? '{"nodes":[]}') as { nodes: unknown[] }).nodes
            .length,
        `archsim:problem:${id}`,
      ),
    )
    .toBe(before.nodes);
  await page.reload();
  await expect(page.getByText('Load set by the problem.')).toBeVisible();
  await expect(page.locator('.service-node')).toHaveCount(before.nodes);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(problems).toEqual([]);
});
