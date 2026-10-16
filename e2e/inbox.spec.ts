import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedCount, seedStatus } from './seed';

/** A vacancy's id as its row shows it: `#42`. */
const ID = /^#\d+$/;
/** The table's vacancy rows — the header row has no id. */
const rows = (page: Page) => page.getByRole('row').filter({ has: page.getByText(ID) });
const rowOf = (page: Page, id: string) =>
  rows(page).filter({ has: page.getByText(`#${id}`, { exact: true }) });
const showing = (n: number) => `Showing ${n} of ${n}`;
const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const queued = seedCount((v) => seedStatus(v) === 'NEW' && v.fullText !== null);
const noText = seedCount((v) => seedStatus(v) === 'NEW' && v.fullText === null);
const filteredOut = seedCount((v) => seedStatus(v) === 'FILTERED_OUT');

test('the three tabs, and ?tab=', async ({ page }) => {
  await page.goto('/inbox');
  await expect(tab(page, 'Queue')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(showing(queued))).toBeVisible();

  await tab(page, 'No text').click();
  await expect(page).toHaveURL(/\/inbox\?tab=no-text$/);
  await expect(page.getByText(showing(noText))).toBeVisible();

  await tab(page, 'Filtered out').click();
  await expect(page).toHaveURL(/\/inbox\?tab=filtered-out$/);
  await expect(page.getByText(showing(filteredOut))).toBeVisible();

  await tab(page, 'Queue').click();
  await expect(page).toHaveURL(/\/inbox$/);

  await page.goto('/inbox?tab=no-text');
  await expect(tab(page, 'No text')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(showing(noText))).toBeVisible();
});

test('Filter out moves a queued row to Filtered out', async ({ page }) => {
  await page.goto('/inbox');
  const id = (await rows(page).getByText(ID).first().textContent())?.slice(1) ?? '';

  await rowOf(page, id).getByRole('button', { name: 'Filter out' }).click();
  await expect(page.getByText('Moved to Filtered out')).toBeVisible();
  await expect(rowOf(page, id)).toHaveCount(0);

  await tab(page, 'Filtered out').click();
  await expect(rowOf(page, id)).toBeVisible();
});

test('Back to queue returns an unanalysed filtered-out row', async ({ page }) => {
  await page.goto('/inbox?tab=filtered-out');
  const row = rows(page)
    .filter({ has: page.getByRole('button', { name: 'Back to queue' }) })
    .first();
  const id = (await row.getByText(ID).textContent())?.slice(1) ?? '';

  await row.getByRole('button', { name: 'Back to queue' }).click();
  await expect(page.getByText('Moved to New')).toBeVisible();
  await expect(rowOf(page, id)).toHaveCount(0);

  await tab(page, 'Queue').click();
  await expect(rowOf(page, id)).toBeVisible();
});

test('each tab says so when it is empty', async ({ page, db }) => {
  await db.vacancy.deleteMany({ where: { status: { in: ['NEW', 'FILTERED_OUT'] } } });

  await page.goto('/inbox');
  await expect(page.getByText('Nothing is waiting for an analysis.')).toBeVisible();
  await tab(page, 'No text').click();
  await expect(page.getByText('Every vacancy in the queue has its posting text.')).toBeVisible();
  await tab(page, 'Filtered out').click();
  await expect(page.getByText('Nothing has been filtered out.')).toBeVisible();
});
