import { SEED_VACANCIES } from '@job-search-copilot/core';
import { expect, test } from './fixtures';

test('the dashboard shows the seed’s numbers', async ({ page }) => {
  await page.goto('/');
  const tile = (label: string) =>
    page
      .locator('.kpi-tile')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('.kpi-value');
  const applied = SEED_VACANCIES.filter((v) => v.moves.some((m) => m.to === 'APPLIED'));

  await expect(tile('Logged')).toHaveText(String(SEED_VACANCIES.length));
  await expect(tile('Applications sent')).toHaveText(String(applied.length));
});

test.describe('without a session cookie', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a guarded route lands on /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
