import { PIPELINE_STATUSES, type PrismaClient } from '@job-search-copilot/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { reached, seedCount, seedOpen, seedStatus, seedTimedOut } from './seed';

const rows = (page: Page) => page.locator('.table-body-scroll tbody tr');
const rowOf = (page: Page, id: number) =>
  rows(page).filter({ has: page.locator('.id', { hasText: new RegExp(`^#${id}$`) }) });
const showing = (n: number) => `Showing ${n} of ${n}`;
/** A KPI tile: a button named "<label>: <count>". */
const tile = (page: Page, label: string, count: number) =>
  page.getByRole('button', { name: `${label}: ${count}`, exact: true });
/** The toolbar's filter — every row's select is named "Status" too. */
const filterSelect = (page: Page) => page.locator('.filter-select');

const ofStatus = (status: string) => seedCount((v) => seedStatus(v) === status);
const pipeline = seedCount((v) => (PIPELINE_STATUSES as readonly string[]).includes(seedStatus(v)));
const timedOut = seedCount(seedTimedOut);
const active = seedCount((v) => seedOpen(v) && !seedTimedOut(v));

/** An APPLIED row moved in the last 30 days, with no tailored CV — near the top of the
 * list, and only ever APPLIED. */
const pickActiveApplied = (db: PrismaClient) =>
  db.vacancy.findFirstOrThrow({
    where: {
      status: 'APPLIED',
      usedTailoredResume: false,
      statusChangedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    orderBy: { id: 'asc' },
  });

test('the tiles filter the table: pressed, and kept in the URL', async ({ page }) => {
  await page.goto('/applications');
  const total = tile(page, 'Total', pipeline);
  await expect(total).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(showing(pipeline))).toBeVisible();

  const timeout = tile(page, 'Timeout', timedOut);
  await timeout.click();
  await expect(page).toHaveURL(/\?status=TIMEOUT$/);
  await expect(timeout).toHaveAttribute('aria-pressed', 'true');
  await expect(total).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(showing(timedOut))).toBeVisible();
  await expect(filterSelect(page)).toHaveValue('TIMEOUT');
  // Every row on screen carries the hourglass.
  await expect(rows(page).locator('.timeout-mark')).toHaveCount(
    await rows(page).locator('.id').count(),
  );

  const rejected = tile(page, 'Rejected', ofStatus('REJECTED'));
  await rejected.click();
  await expect(page).toHaveURL(/\?status=REJECTED$/);
  await expect(rejected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(showing(ofStatus('REJECTED')))).toBeVisible();

  await total.click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(total).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/applications?status=OFFER');
  await expect(tile(page, 'Offer', ofStatus('OFFER'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(showing(ofStatus('OFFER')))).toBeVisible();
});

test('the Status select: Active, Timeout, Awaiting', async ({ page }) => {
  await page.goto('/applications');

  await filterSelect(page).selectOption({ label: 'Active' });
  await expect(page).toHaveURL(/\?status=ACTIVE$/);
  await expect(page.getByText(showing(active))).toBeVisible();
  await expect(tile(page, 'Active', active)).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page).locator('.timeout-mark')).toHaveCount(0);

  await filterSelect(page).selectOption({ label: 'Timeout' });
  await expect(page).toHaveURL(/\?status=TIMEOUT$/);
  await expect(page.getByText(showing(timedOut))).toBeVisible();

  await filterSelect(page).selectOption({ label: 'Awaiting' });
  await expect(page).toHaveURL(/\?status=AWAITING$/);
  await expect(page.getByText(showing(ofStatus('AWAITING')))).toBeVisible();
  const selects = rows(page).getByRole('combobox', { name: 'Status' });
  await expect(selects).toHaveCount(ofStatus('AWAITING'));
  for (const select of await selects.all()) await expect(select).toHaveValue('AWAITING');

  await filterSelect(page).selectOption({ label: 'All' });
  await expect(page).toHaveURL(/\/applications$/);
});

test("a move to Awaiting, then Offer: the tiles and the dashboard's counts follow", async ({
  page,
  db,
}) => {
  const { id } = await pickActiveApplied(db);
  const responded = seedCount((v) => reached(v, 'ACTION_NEEDED', 'INTERVIEW', 'AWAITING', 'OFFER'));
  const interview = seedCount((v) => reached(v, 'INTERVIEW', 'OFFER'));

  await page.goto('/applications');
  const select = rowOf(page, id).getByRole('combobox', { name: 'Status' });
  await expect(select).toHaveValue('APPLIED');

  await select.selectOption({ label: 'Awaiting' });
  await expect(page.getByText('Moved to Awaiting')).toBeVisible();
  await expect(select).toHaveValue('AWAITING');
  await expect(tile(page, 'Awaiting', ofStatus('AWAITING') + 1)).toBeVisible();

  await select.selectOption({ label: 'Offer' });
  await expect(page.getByText('Moved to Offer')).toBeVisible();
  await expect(select).toHaveValue('OFFER');
  await expect(tile(page, 'Offer', ofStatus('OFFER') + 1)).toBeVisible();
  await expect(tile(page, 'Awaiting', ofStatus('AWAITING'))).toBeVisible();

  await page.goto('/');
  const kpi = (label: string) =>
    page
      .locator('.kpi-tile')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('.kpi-value');
  const funnel = (label: string) =>
    page
      .locator('.funnel-row')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('.funnel-value');
  await expect(kpi('Interviews')).toHaveText(String(interview + 1));
  await expect(funnel('Got a response')).toHaveText(String(responded + 1));
  await expect(funnel('Interview')).toHaveText(String(interview + 1));
});

test('the Edit dialog updates salary, CV and comment', async ({ page, db }) => {
  const { id, title, company } = await pickActiveApplied(db);
  const comment = 'Sent the portfolio link as well.';
  await page.goto('/applications');
  const row = rowOf(page, id);
  await expect(row.getByText('✓')).toHaveCount(0);

  await row.getByRole('button', { name: `Edit ${title} at ${company}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit application' });
  await dialog.getByLabel('Salary / rate').fill('77k EUR / year');
  await dialog.getByLabel('Used a tailored resume').check();
  await dialog.getByLabel('Add a comment').fill(comment);
  await dialog.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('Application updated')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('77k EUR / year')).toBeVisible();
  await expect(row.getByText('✓')).toBeVisible();
  await expect(row.locator('.comment-cell')).toContainText(comment);
});

test("the merged comment's Show more / Show less", async ({ page, db }) => {
  // An interview row: the analysis, the applying note and two rounds — past two lines.
  const { id } = await db.vacancy.findFirstOrThrow({
    where: { status: 'INTERVIEW' },
    orderBy: { id: 'asc' },
  });
  await page.goto('/applications?status=INTERVIEW');
  const cell = rowOf(page, id).locator('.comment-cell');

  const more = cell.getByRole('button', { name: 'Show more' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  const clamped = await cell.locator('.clamp').evaluate((el) => el.clientHeight);
  await more.click();
  const less = cell.getByRole('button', { name: 'Show less' });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  await expect(cell.locator('hr').first()).toBeVisible();
  expect(await cell.locator('.clamp').evaluate((el) => el.clientHeight)).toBeGreaterThan(clamped);

  await less.click();
  await expect(more).toBeVisible();
});
