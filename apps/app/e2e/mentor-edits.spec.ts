import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

/** Each browser uses its own problem, so conversations never meet another spec's. */
const PROBLEM = { chromium: 'leaderboard', webkit: 'notifications' } as const;

test('the mentor proposes, the person applies, undoes, discards; it survives a reload (mentor-edits)', async ({
  page,
}, info) => {
  const id = PROBLEM[info.project.name as keyof typeof PROBLEM];
  const problems = watchConsole(page);
  // start from an empty conversation, whatever an earlier run left on the server
  const cleared = await page.request.delete(`/__archsim/conversation/${id}`, {
    headers: { origin: 'http://127.0.0.1:4173' },
  });
  expect(cleared.status()).toBe(204);
  await page.goto(`/#/problems/${id}/study`);
  await page.getByRole('button', { name: 'Abrir mentor' }).click();
  const question = page.getByRole('textbox', { name: 'Pergunta para o mentor' });
  const api = page.locator('.service-node-label', { hasText: /^API$/ });

  // a proposal arrives as a card; nothing changes yet (FR-3, FR-4)
  await question.fill('proponha:ec2');
  await question.press('Enter');
  const card = page.getByRole('region', { name: 'Proposta do mentor' }).first();
  await expect(card).toContainText("+ EC2 'API'");
  await expect(card).toContainText("+ conexão 'Usuários' → 'API' (novo)");
  await expect(api).toHaveCount(0);

  // Aplicar puts it all in; Ctrl+Z takes it all out (FR-7, FR-8)
  await card.getByRole('button', { name: 'Aplicar' }).click();
  await expect(api).toHaveCount(1);
  await expect(card).toContainText('aplicada');
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  await expect(api).toHaveCount(0);
  await card.getByRole('button', { name: 'Aplicar' }).click();
  await expect(api).toHaveCount(1);

  // a second proposal, discarded: nothing changes (FR-5)
  await question.fill('proponha:ec2');
  await question.press('Enter');
  const second = page.getByRole('region', { name: 'Proposta do mentor' }).nth(1);
  await second.getByRole('button', { name: 'Descartar' }).click();
  await expect(second).toContainText('descartada');
  await expect(api).toHaveCount(1);

  // the states come back after a reload (FR-9) — once autosave (500 ms) has kept the draft
  await expect
    .poll(() =>
      page.evaluate(
        (k) => /"label":\s*"API"/.test(localStorage.getItem(k) ?? ''),
        `archsim:study:${id}`,
      ),
    )
    .toBe(true);
  await page.reload();
  const cards = page.getByRole('region', { name: 'Proposta do mentor' });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('aplicada');
  await expect(cards.nth(1)).toContainText('descartada');
  await expect(api).toHaveCount(1);
  expect(problems).toEqual([]);
});
