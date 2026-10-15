import { SEED_VACANCIES } from '@job-search-copilot/core';
import { expect, test } from './fixtures';
import { reached, seedCount, seedStatus } from './seed';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the tiles and the funnel count the seed', async ({ page }) => {
  const recommended = seedCount((v) => !!v.analysis && v.analysis.recommendation !== 'SKIP');
  const applied = seedCount((v) => reached(v, 'APPLIED'));
  const responded = seedCount((v) => reached(v, 'ACTION_NEEDED', 'INTERVIEW', 'AWAITING', 'OFFER'));
  const interview = seedCount((v) => reached(v, 'INTERVIEW', 'OFFER'));

  const tile = (label: string) =>
    page
      .locator('.kpi-tile')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('.kpi-value');
  await expect(tile('Logged')).toHaveText(String(SEED_VACANCIES.length));
  await expect(tile('Awaiting analysis')).toHaveText(
    String(seedCount((v) => seedStatus(v) === 'NEW')),
  );
  await expect(tile('Awaiting triage')).toHaveText(
    String(seedCount((v) => seedStatus(v) === 'NOT_REVIEWED')),
  );
  await expect(tile('Recommended')).toHaveText(String(recommended));
  await expect(tile('Applications sent')).toHaveText(String(applied));
  await expect(tile('Interviews')).toHaveText(String(interview));

  const funnel = (label: string) =>
    page
      .locator('.funnel-row')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('.funnel-value');
  await expect(funnel('Logged')).toHaveText(String(SEED_VACANCIES.length));
  await expect(funnel('Recommended')).toHaveText(String(recommended));
  await expect(funnel('Applied')).toHaveText(String(applied));
  await expect(funnel('Got a response')).toHaveText(String(responded));
  await expect(funnel('Interview')).toHaveText(String(interview));
});

test('a "Needs your review" link opens its vacancy', async ({ page }) => {
  const items = page.locator('.attn-item');
  await expect(items).toHaveCount(10); // the queue's size; the seed has more NOT_REVIEWED
  const title = await items.first().locator('.attn-title').textContent();

  await items.first().getByRole('link', { name: 'Review' }).click();
  await expect(page).toHaveURL(/\/vacancies\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: title ?? '' })).toBeVisible();
});

test('a Recent activity link opens its vacancy', async ({ page }) => {
  const items = page.locator('.activity-item');
  await expect(items).toHaveCount(6);
  const link = items.first().locator('.role-link');
  const title = await link.textContent();

  await link.click();
  await expect(page).toHaveURL(/\/vacancies\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: title ?? '' })).toBeVisible();
});
