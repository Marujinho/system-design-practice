import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reference, seed, watchConsole, withUnits } from './helpers';

/** Each browser studies a different problem, so conversations from one run don't meet the other's. */
const PLAN = {
  chromium: {
    id: 'url-shortener',
    title: 'Encurtador de URL',
    node: 'app',
    label: 'API de redirecionamento',
  },
  webkit: {
    id: 'rate-limiter',
    title: 'Rate limiter distribuído',
    node: 'limiter',
    label: 'Gateway com limitador',
  },
} as const;

const dir = () => process.env.ARCHSIM_PRACTICE_DIR ?? '';
const snapshot = () =>
  ['history.json', 'session.json'].map((f) =>
    existsSync(join(dir(), f)) ? readFileSync(join(dir(), f), 'utf8') : null,
  );

test('study: ask the mentor while building, stop, reload, score without recording (study-mode)', async ({
  page,
}, info) => {
  const plan = PLAN[info.project.name as keyof typeof PLAN];
  const problems = watchConsole(page);
  const before = snapshot();
  // A practice draft exists; the study draft must start apart from it (FR-2).
  await seed(page, `archsim:problem:${plan.id}`, withUnits(reference(plan.id), plan.node, 3));

  await page.goto('/#/problems');
  await page.getByRole('link', { name: `Estudar ${plan.title} com o mentor` }).click();
  await expect(page.getByRole('note').filter({ hasText: 'não conta para a nota' })).toBeVisible();
  await expect(page.locator('.service-node-label', { hasText: plan.label })).toHaveCount(0);

  // closed, the chat is a pill; open, the question has the focus (FR-3)
  const launcher = page.getByRole('button', { name: 'Abrir mentor' });
  await expect(launcher).toHaveAttribute('aria-expanded', 'false');
  await launcher.click();
  const question = page.getByRole('textbox', { name: 'Pergunta para o mentor' });
  await expect(question).toBeFocused();
  await expect(page.getByRole('radio', { name: /Assinatura do Claude/ })).toBeChecked();

  // the reply streams in and names a node of the diagram on screen (FR-4, FR-7)
  await question.fill('O que está saturando?');
  await question.press('Enter');
  const log = page.getByRole('log', { name: 'Conversa com o mentor' });
  await expect(log).toContainText('o nó n1 é o primeiro da lista.');
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();

  // stop a slow reply: what arrived stays, marked interrupted
  await question.fill('lento');
  await question.press('Enter');
  await expect(log).toContainText('Pensando devagar');
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(log).toContainText('resposta interrompida');

  // the full name of an acronym on the card, as a hint (FR-20)
  await page.getByRole('searchbox', { name: 'Buscar serviço' }).fill('queue');
  await page.getByRole('button', { name: 'SQS Simple Queue Service' }).click();
  await expect(page.locator('.service-node[title="Simple Queue Service"]')).toHaveCount(1);

  // the conversation survives a reload (FR-8)
  await page.reload();
  await expect(page.getByRole('log', { name: 'Conversa com o mentor' })).toContainText(
    'o nó n1 é o primeiro da lista.',
  );

  // M closes it from the canvas; the column goes away
  await page.locator('.react-flow__pane').click();
  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: 'Abrir mentor' })).toBeVisible();
  await expect(page.locator('#mentor-chat')).toBeHidden();

  // score without recording anything (FR-9)
  await page.getByRole('button', { name: 'Finalizar e pontuar' }).click();
  const result = page.getByRole('dialog', { name: 'Resultado' });
  await expect(result.getByText('estudo · não registrado')).toBeVisible();
  await expect(result.getByText('novo recorde')).toHaveCount(0);
  await result.getByRole('button', { name: 'Continuar ajustando' }).click();
  expect(snapshot()).toEqual(before);

  // practice still has its own draft
  await page.goto(`/#/problems/${plan.id}`);
  await expect(page.locator('.service-node-label', { hasText: plan.label }).first()).toBeVisible();

  expect(problems).toEqual([]);
});
