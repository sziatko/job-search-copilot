import { type PrismaClient, SEED_VACANCIES } from '@job-search-copilot/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

type Where = NonNullable<Parameters<PrismaClient['vacancy']['findFirstOrThrow']>[0]>['where'];

/** The lowest-id vacancy that matches — a seed row picked by its shape, not a fixed id. */
const pick = async (db: PrismaClient, where: Where) =>
  db.vacancy.findFirstOrThrow({ where, orderBy: { id: 'asc' } });

const statusSelect = (page: Page) => page.getByRole('combobox', { name: 'Status' });
const timeline = (page: Page) => page.locator('.status-timeline .timeline-label');

test('the header, and "Not analysed yet" for a vacancy with no analysis', async ({ page, db }) => {
  const analysed = await pick(db, { status: 'NOT_REVIEWED', recommendation: 'APPLY' });
  await page.goto(`/vacancies/${analysed.id}`);
  await expect(page.locator('.detail-title')).toHaveText(analysed.title);
  await expect(page.locator('.detail-company-name')).toHaveText(analysed.company);
  await expect(page.locator('.detail-id-tag')).toHaveText(`#${analysed.id}`);
  await expect(page.locator('.detail-meta-row').getByText('Apply', { exact: true })).toBeVisible();
  await expect(page.getByText('Not analysed yet')).toHaveCount(0);

  const fresh = await pick(db, { status: 'NEW', recommendation: null });
  await page.goto(`/vacancies/${fresh.id}`);
  await expect(page.locator('.detail-title')).toHaveText(fresh.title);
  await expect(page.getByText('Not analysed yet')).toBeVisible();
});

test('a plain status move, and the Status history timeline gains the step', async ({
  page,
  db,
}) => {
  const { id } = await pick(db, { status: 'NOT_REVIEWED' });
  await page.goto(`/vacancies/${id}`);
  await expect(timeline(page).first()).toBeVisible();
  const steps = await timeline(page).count();

  await statusSelect(page).selectOption({ label: 'Unavailable' });
  await expect(page.getByText('Moved to Unavailable')).toBeVisible();
  await expect(statusSelect(page)).toHaveValue('UNAVAILABLE');
  await expect(timeline(page)).toHaveCount(steps + 1);
  await expect(timeline(page).last()).toHaveText('Unavailable');
});

test('Save for later with a comment', async ({ page, db }) => {
  const comment = 'Check the on-call rota before applying.';
  const { id } = await pick(db, { status: 'NOT_REVIEWED' });
  await page.goto(`/vacancies/${id}`);

  await statusSelect(page).selectOption({ label: 'Saved for later' });
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Comment').fill(comment);
  await dialog.getByRole('button', { name: 'Save for later' }).click();
  await expect(page.getByText('Moved to Saved for later')).toBeVisible();
  await expect(statusSelect(page)).toHaveValue('SAVED_FOR_LATER');
  await expect(page.locator('.history-text', { hasText: comment })).toBeVisible();
});

test('Decline: Cancel keeps the status, Decline moves it', async ({ page, db }) => {
  const { id } = await pick(db, { status: 'NOT_REVIEWED' });
  await page.goto(`/vacancies/${id}`);
  const dialog = page.getByRole('dialog', { name: 'Decline this vacancy?' });

  await statusSelect(page).selectOption({ label: 'Declined' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(statusSelect(page)).toHaveValue('NOT_REVIEWED');

  await statusSelect(page).selectOption({ label: 'Declined' });
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await expect(page.getByText('Moved to Declined')).toBeVisible();
  await expect(statusSelect(page)).toHaveValue('DECLINED');
});

test('Apply through the dialog turns the select into the pipeline one', async ({ page, db }) => {
  const { id } = await pick(db, { status: 'NOT_REVIEWED' });
  await page.goto(`/vacancies/${id}`);

  await statusSelect(page).selectOption({ label: 'Applied' });
  const dialog = page.getByRole('dialog', { name: 'Mark as applied' });
  await dialog.getByLabel('Salary / rate').fill('68k EUR / year');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Application submitted!')).toBeVisible();
  await expect(statusSelect(page)).toHaveValue('APPLIED');
  await expect(statusSelect(page).locator('option')).toHaveText([
    'Applied',
    'Action needed',
    'Interview',
    'Awaiting',
    'Offer',
    'Rejected',
  ]);
  await expect(page.locator('.fact-row', { hasText: 'Salary' })).toContainText('68k EUR / year');
});

test("an application's pipeline select moves it on", async ({ page, db }) => {
  const { id } = await pick(db, { status: 'APPLIED' });
  await page.goto(`/vacancies/${id}`);
  await expect(statusSelect(page)).toHaveValue('APPLIED');

  await statusSelect(page).selectOption({ label: 'Action needed' });
  await expect(page.getByText('Moved to Action needed')).toBeVisible();
  await expect(statusSelect(page)).toHaveValue('ACTION_NEEDED');
  await expect(timeline(page).last()).toHaveText('Action needed');
});

test('Show full description / Show less', async ({ page, db }) => {
  // The seed's postings fit the clamp; this one does not.
  const { id } = await pick(db, { status: 'NOT_REVIEWED' });
  const paragraph = 'We ship a design system used by every product team. ';
  await db.vacancy.update({
    where: { id },
    data: { fullText: Array.from({ length: 30 }, () => paragraph).join('\n') },
  });
  await page.goto(`/vacancies/${id}`);

  const more = page.getByRole('button', { name: 'Show full description' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  const clamped = await page.locator('.desc-body').evaluate((el) => el.clientHeight);
  await more.click();
  const less = page.getByRole('button', { name: 'Show less' });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  expect(await page.locator('.desc-body').evaluate((el) => el.clientHeight)).toBeGreaterThan(
    clamped,
  );

  await less.click();
  await expect(more).toBeVisible();
});

test('Add comment', async ({ page, db }) => {
  const body = 'Their stack moved to Vite last quarter.';
  const { id } = await pick(db, { status: 'NOT_REVIEWED' });
  await page.goto(`/vacancies/${id}`);

  const box = page.getByLabel('Add a comment');
  await box.fill(body);
  await page.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.getByText('Comment added')).toBeVisible();
  await expect(page.locator('.history-item', { hasText: body })).toContainText('You');
  await expect(box).toHaveValue('');
});

test("Other vacancies lists the company's others and opens one", async ({ page, db }) => {
  const { id, company } = await pick(db, { status: 'NOT_REVIEWED' });
  const others = SEED_VACANCIES.filter((v) => v.company === company).length - 1;
  expect(others).toBeGreaterThan(0);
  await page.goto(`/vacancies/${id}`);

  const card = page.locator('.card', { hasText: `Other vacancies at ${company}` });
  await expect(card.locator('.count')).toHaveText(`${others} vacancies`);
  const rows = card.locator('tbody tr');
  await expect(rows).toHaveCount(others);
  await expect(rows.locator('.id', { hasText: new RegExp(`^#${id}$`) })).toHaveCount(0);

  const otherId = (await rows.first().locator('.id').textContent())?.slice(1);
  await rows.first().getByRole('link', { name: 'Open vacancy details' }).click();
  await expect(page).toHaveURL(new RegExp(`/vacancies/${otherId}$`));
  await expect(page.locator('.detail-id-tag')).toHaveText(`#${otherId}`);
});

test('"Vacancy not found" for an unknown id; Back goes to /vacancies', async ({ page }) => {
  await page.goto('/vacancies/999999');
  await expect(page.getByText('Vacancy not found.')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/vacancies$/);
});

test('Back returns to the list the page was opened from', async ({ page }) => {
  await page.goto('/vacancies?status=DECLINED');
  await page.getByRole('link', { name: 'Open vacancy details' }).first().click();
  await expect(page).toHaveURL(/\/vacancies\/\d+$/);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/vacancies\?status=DECLINED$/);
});
