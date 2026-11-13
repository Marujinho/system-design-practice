import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

test('pick a bigger EC2 type in the panel: the card and the cost follow (aws-instance-types FR-9b, FR-12, FR-13)', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto('/#/free');
  await page.getByRole('button', { name: 'Usuários / Internet' }).click();
  await page.getByRole('button', { name: 'EC2', exact: true }).click();

  const ec2 = page.locator('.service-node', { hasText: 'EC2' });
  // a new node starts on the catalog's first type, as before
  await expect(ec2.locator('.service-node-variant')).toHaveText('t3.nano');

  // adding a service selects it, so its properties are already open
  const picker = page.getByLabel('Tipo');
  await expect(picker).toBeVisible();

  await expect(picker.locator('optgroup')).toHaveCount(4);
  await expect(picker.locator('optgroup[label="Computação"] option')).toHaveCount(4);
  await expect(picker.locator('option[value="c5.xlarge"]')).toContainText('2.000 req/s');

  const cost = page.locator('.figures div', { hasText: 'Custo' }).locator('dd');
  const before = await cost.textContent();
  await picker.selectOption('c5.xlarge');

  await expect(ec2.locator('.service-node-variant')).toHaveText('c5.xlarge');
  await expect(cost).not.toHaveText(before ?? '');
  await expect(page.locator('.figures div', { hasText: 'Capacidade' }).locator('dd')).toHaveText(
    '2.000 req/s',
  );
  expect(problems).toEqual([]);
});
