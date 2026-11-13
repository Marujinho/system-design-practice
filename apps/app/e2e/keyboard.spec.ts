import { expect, test, type Page } from '@playwright/test';

/** Safari (and WebKit) moves focus to links and buttons with Option+Tab; plain Tab skips them. */
let TAB = 'Tab';

async function tabTo(
  page: Page,
  match: (el: { role: string; name: string }) => boolean,
  limit = 80,
): Promise<void> {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press(TAB);
    const el = await page.evaluate(() => {
      const a = document.activeElement as HTMLInputElement | null;
      // a field's name comes from its <label>, else aria-label, else its text
      const label =
        a?.labels?.[0]?.textContent ?? a?.getAttribute('aria-label') ?? a?.textContent ?? '';
      return {
        role: a?.getAttribute('role') ?? a?.tagName.toLowerCase() ?? '',
        name: label.trim(),
      };
    });
    if (match(el)) return;
  }
  throw new Error('não cheguei ao elemento só com Tab');
}

test('keyboard only: open the free canvas, add a service, edit it, read the result (NFR-7)', async ({
  page,
  browserName,
}) => {
  TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.goto('/#/');
  await tabTo(page, (e) => e.name === 'Canvas livre');
  await page.keyboard.press('Enter');
  await tabTo(page, (e) => e.name === 'Buscar serviço');
  await page.keyboard.type('ec2');
  await tabTo(page, (e) => e.name === 'EC2');
  await page.keyboard.press('Enter');
  await expect(page.locator('.service-node')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'EC2' })).toBeVisible();
  await tabTo(page, (e) => e.name === 'Réplicas');
  await page.keyboard.press('End');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Backspace');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await expect(page.getByText('400 req/s', { exact: true }).first()).toBeVisible();
});

test('keyboard only: collapse and expand the palette (edge-hover NFR-2)', async ({
  page,
  browserName,
}) => {
  TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.goto('/#/free');
  await tabTo(page, (e) => e.name === 'Recolher paleta');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('searchbox', { name: 'Buscar serviço' })).toBeHidden();
  // the same button, now named for what it does next
  await expect(page.getByRole('button', { name: 'Expandir paleta' })).toBeFocused();
  await page.keyboard.press('Enter');
  await tabTo(page, (e) => e.name === 'Buscar serviço');
  await page.keyboard.type('ec2');
  await expect(page.getByRole('button', { name: 'EC2', exact: true })).toBeVisible();
});
