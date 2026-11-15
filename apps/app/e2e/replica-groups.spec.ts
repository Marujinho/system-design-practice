import { expect, test } from '@playwright/test';
import { reference, seed, watchConsole } from './helpers';

test('changing the replicas multiplies the copies on the card (replica-groups)', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await seed(page, 'archsim:free', reference('url-shortener'));
  await page.goto('/#/free');
  const card = page.locator('.service-node', { hasText: 'API de redirecionamento' });
  // the reference runs 30 replicas: twelve copies and the rest counted
  await expect(card.getByRole('img', { name: '30 réplicas' })).toBeVisible();
  await expect(card.locator('.replica')).toHaveCount(12);
  await expect(card.locator('.replica-more')).toHaveText('+18');

  // open its properties with a double click, set 6, then 1 (mentor-edits FR-14)
  const box = await card.locator('.service-node-label').boundingBox();
  if (!box) throw new Error('card fora da tela');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const replicas = page.getByLabel('Réplicas', { exact: true });
  await replicas.fill('6');
  await replicas.press('Enter');
  await expect(card.getByRole('img', { name: '6 réplicas' })).toBeVisible();
  await expect(card.locator('.replica')).toHaveCount(6);
  await replicas.fill('1');
  await replicas.press('Enter');
  await expect(card.locator('.replica-group')).toHaveCount(0);
  await replicas.fill('8');
  await replicas.press('Enter');
  await expect(card.locator('.replica')).toHaveCount(8);
  expect(problems).toEqual([]);
});
