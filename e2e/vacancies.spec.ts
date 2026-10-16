import { SEED_VACANCIES } from '@job-search-copilot/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedCount, seedStatus } from './seed';

/** A vacancy's id as its row shows it: `#42`. */
const ID = /^#\d+$/;
/** The table's vacancy rows — the header row has no id. */
const rows = (page: Page) => page.getByRole('row').filter({ has: page.getByText(ID) });
const rowOf = (page: Page, id: string) =>
  rows(page).filter({ has: page.getByText(`#${id}`, { exact: true }) });
const showing = (n: number, total = n) => `Showing ${n} of ${total}`;
const ofStatus = (status: string) => seedCount((v) => seedStatus(v) === status);

/** The first row of the table on screen: its id (no `#`) and its locator. */
async function firstRow(page: Page) {
  const id = (await rows(page).getByText(ID).first().textContent())?.slice(1) ?? '';
  return { id, row: rowOf(page, id) };
}

test('the Status select filters, and the URL keeps it', async ({ page }) => {
  await page.goto('/vacancies');
  await expect(page.getByText(showing(ofStatus('NOT_REVIEWED')))).toBeVisible();
  const select = page.getByLabel('Status', { exact: true });

  await select.selectOption({ label: 'Saved for later' });
  await expect(page).toHaveURL(/\?status=SAVED_FOR_LATER$/);
  await expect(page.getByText(showing(ofStatus('SAVED_FOR_LATER')))).toBeVisible();
  await expect(rows(page).getByText('Saved for later', { exact: true })).toHaveCount(
    ofStatus('SAVED_FOR_LATER'),
  );

  await select.selectOption({ label: 'All' });
  await expect(page).toHaveURL(/\?status=ALL$/);
  const context = ['NOT_REVIEWED', 'SAVED_FOR_LATER', 'DECLINED', 'UNAVAILABLE'];
  await expect(
    page.getByText(showing(seedCount((v) => context.includes(seedStatus(v))))),
  ).toBeVisible();

  // Not reviewed is the absent value.
  await select.selectOption({ label: 'Not reviewed' });
  await expect(page).toHaveURL(/\/vacancies$/);

  await page.goto('/vacancies?status=DECLINED');
  await expect(select).toHaveValue('DECLINED');
  await expect(page.getByText(showing(ofStatus('DECLINED')))).toBeVisible();
});

test('infinite scroll past 100 rows, and a filter change scrolls back up', async ({ page, db }) => {
  // The seed's /vacancies context is under 100 rows: these push Not reviewed past it.
  const extra = 50;
  const { id: userId } = await db.user.findFirstOrThrow(); // the one signed in
  await db.vacancy.createMany({
    data: Array.from({ length: extra }, (_, i) => ({
      userId,
      company: 'Overflow Test Co',
      title: `Filler Engineer ${i + 1}`,
      applyUrl: `https://jobs.example.com/filler/${i + 1}`,
      status: 'NOT_REVIEWED' as const,
      matchScore: 60,
      recommendation: 'APPLY_WITH_CAVEATS' as const,
    })),
  });
  const total = ofStatus('NOT_REVIEWED') + extra;

  await page.goto('/vacancies');
  await expect(page.getByText(showing(100, total))).toBeVisible();
  const box = page.getByRole('region', { name: 'Vacancies' });
  await box.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByText(showing(total))).toBeVisible();
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'All' });
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBe(0);
});

test('Save for later with a comment, and the comment shows on the vacancy page', async ({
  page,
}) => {
  const comment = 'Ask about the release cadence first.';
  await page.goto('/vacancies');
  const { id, row } = await firstRow(page);

  await row.getByRole('button', { name: 'Save for later' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Comment').fill(comment);
  await dialog.getByRole('button', { name: 'Save for later' }).click();
  await expect(page.getByText('Moved to Saved for later')).toBeVisible();
  await expect(rowOf(page, id)).toHaveCount(0);

  await page.goto(`/vacancies/${id}`);
  await expect(page.getByText(comment)).toBeVisible();
});

test('Decline: Cancel keeps the row, "Yes, decline" moves it', async ({ page }) => {
  await page.goto('/vacancies');
  const { id, row } = await firstRow(page);
  const dialog = page.getByRole('dialog', { name: 'Decline this vacancy?' });

  await row.getByRole('button', { name: 'Decline' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Decline' }).click();
  await dialog.getByRole('button', { name: 'Yes, decline' }).click();
  await expect(page.getByText('Moved to Declined')).toBeVisible();
  await expect(rowOf(page, id)).toHaveCount(0);

  await page.goto('/vacancies?status=DECLINED');
  await expect(rowOf(page, id)).toBeVisible();
});

test('Mark unavailable', async ({ page }) => {
  await page.goto('/vacancies');
  const { id, row } = await firstRow(page);

  await row.getByRole('button', { name: 'Mark unavailable' }).click();
  await expect(page.getByText('Moved to Unavailable')).toBeVisible();
  await expect(rowOf(page, id)).toHaveCount(0);
});

test('Mark not reviewed', async ({ page }) => {
  await page.goto('/vacancies?status=SAVED_FOR_LATER');
  const { id, row } = await firstRow(page);

  await row.getByRole('button', { name: 'Mark not reviewed' }).click();
  await expect(page.getByText('Moved to Not reviewed')).toBeVisible();
  await expect(rowOf(page, id)).toHaveCount(0);

  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Not reviewed' });
  await expect(rowOf(page, id)).toHaveCount(1);
});

test('the Apply dialog, and the vacancy shows in /applications', async ({ page }) => {
  await page.goto('/vacancies');
  const { id, row } = await firstRow(page);

  await row.getByRole('button', { name: 'Apply', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mark as applied' });
  await dialog.getByLabel('Salary / rate').fill('72k EUR / year');
  await dialog.getByLabel('Used a tailored resume').check();
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Application submitted!')).toBeVisible();
  await expect(rowOf(page, id)).toHaveCount(0);

  await page.goto('/applications');
  await expect(rowOf(page, id)).toBeVisible();
  await expect(rowOf(page, id).getByText('72k EUR / year')).toBeVisible();
});

test('Copy puts the vacancy on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/vacancies');
  const { id, row } = await firstRow(page);

  const copy = row.getByRole('button', { name: /^Copy / });
  await copy.click();
  await expect(copy.getByRole('status')).toHaveText('Copied');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('[Job Search Copilot]');
  expect(text).toContain(`ID: ${id}`);
});

test('the company-history modal marks the Current row and opens its details', async ({
  page,
  db,
}) => {
  await page.goto('/vacancies');
  const { id, row } = await firstRow(page);
  const { company } = await db.vacancy.findUniqueOrThrow({ where: { id: Number(id) } });
  const atCompany = SEED_VACANCIES.filter((v) => v.company === company).length;

  await row.getByRole('button', { name: `${atCompany - 1} other vacancies at ${company}` }).click();
  const dialog = page.getByRole('dialog', { name: `All vacancies at ${company}` });
  await expect(dialog.getByText(`${atCompany} vacancies, newest first`)).toBeVisible();
  const current = dialog
    .getByRole('row')
    .filter({ has: page.getByText('Current', { exact: true }) });
  await expect(current.getByText(ID)).toHaveText(`#${id}`);

  const [details] = await Promise.all([
    page.waitForEvent('popup'),
    current.getByRole('link', { name: 'Open vacancy details' }).click(),
  ]);
  await expect(details).toHaveURL(new RegExp(`/vacancies/${id}$`));
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('a long company history scrolls inside the dialog, which stays on screen', async ({
  page,
  db,
}) => {
  const company = 'Longlist Test Co';
  const count = 40;
  const { id: userId } = await db.user.findFirstOrThrow(); // the one signed in
  await db.vacancy.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      userId,
      company,
      title: `Longlist Engineer ${i + 1}`,
      applyUrl: `https://jobs.example.com/longlist/${i + 1}`,
      status: 'NOT_REVIEWED' as const,
      matchScore: 99, // the top of the list
      recommendation: 'APPLY' as const,
    })),
  });

  await page.goto('/vacancies');
  await page
    .getByRole('button', { name: `${count - 1} other vacancies at ${company}` })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: `All vacancies at ${company}` });
  await expect(dialog.getByText(`${count} vacancies, newest first`)).toBeVisible();
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport();
});
