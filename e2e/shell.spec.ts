import { SEED_VACANCIES } from '@job-search-copilot/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedStatus } from './seed';

const title = (page: Page) => page.getByRole('banner').getByRole('heading', { level: 1 });
const sidebar = (page: Page) => page.getByRole('complementary');

test('each sidebar link opens its page', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation');
  for (const [link, path, heading] of [
    ['Analyzed vacancies', '/vacancies', 'Analyzed vacancies'],
    ['Application tracker', '/applications', 'Application tracker'],
    ['Inbox', '/inbox', 'Inbox'],
    ['Profile & forms', '/profile', 'Profile & forms'],
    ['Dashboard', '/', 'Dashboard'],
  ]) {
    await nav.getByRole('link', { name: link }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
    await expect(title(page)).toHaveText(heading);
  }
});

test('Collapse / Expand, and each route its own default', async ({ page }) => {
  const width = async () => (await sidebar(page).boundingBox())?.width ?? 0;
  // Polled: the width animates.
  const isOpen = () => expect.poll(width).toBeGreaterThan(200);
  const isRail = () => expect.poll(width).toBeLessThan(100);

  await page.goto('/'); // the dashboard starts open
  await isOpen();
  await page.getByTitle('Collapse sidebar').click();
  await isRail();

  // A table page starts as a rail; the manual toggle was the dashboard's only.
  await page.getByRole('navigation').getByRole('link', { name: 'Analyzed vacancies' }).click();
  await isRail();
  await page.getByTitle('Expand sidebar').click();
  await isOpen();

  await page.getByRole('navigation').getByRole('link', { name: 'Application tracker' }).click();
  await isRail();
  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).click();
  await isOpen();
});

test('the theme toggle survives a reload', async ({ page }) => {
  await page.goto('/'); // the browser's colour scheme is light
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme', /./);

  await page.getByRole('button', { name: /^Light theme/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /^Dark theme/ })).toBeVisible();
});

test('the topbar goes compact on scroll, and back at the top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 }); // the dashboard runs past it
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pipeline funnel' })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(title(page)).toHaveCSS('font-size', '15px');

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(title(page)).toHaveCSS('font-size', '20px');
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Open / Close navigation', async ({ page }) => {
    await page.goto('/');
    await expect(sidebar(page)).not.toBeInViewport();

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(sidebar(page)).toBeInViewport();
    // The scrim's middle is under the drawer: click its uncovered right edge.
    await page
      .getByRole('button', { name: 'Close navigation' })
      .click({ position: { x: 370, y: 400 } });
    await expect(sidebar(page)).not.toBeInViewport();

    // A link closes it too.
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Inbox' }).click();
    await expect(title(page)).toHaveText('Inbox');
    await expect(sidebar(page)).not.toBeInViewport();
  });

  test('every page title fits on one line', async ({ page }) => {
    for (const path of ['/', '/vacancies', '/applications', '/inbox', '/profile']) {
      await page.goto(path);
      await expect(title(page)).not.toBeEmpty();
      const lines = await title(page).evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      });
      expect(lines, path).toBe(1);
    }
  });
});

test('the search modal: a term, All / Context, Hide Filtered out, open details', async ({
  page,
  db,
}) => {
  // A company with a FILTERED_OUT vacancy, so the checkbox changes the count.
  const company = SEED_VACANCIES.find((v) => seedStatus(v) === 'FILTERED_OUT')?.company ?? '';
  const ofCompany = SEED_VACANCIES.filter((v) => v.company === company).map(seedStatus);
  const context = ['NOT_REVIEWED', 'SAVED_FOR_LATER', 'DECLINED', 'UNAVAILABLE']; // /vacancies'
  const counted = (n: number) => `${n} vacancies, newest first`;

  await page.goto('/vacancies');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Type a company or role.')).toBeVisible();

  await dialog.getByRole('searchbox', { name: 'Search company or role' }).fill(company);
  await expect(
    dialog.getByText(counted(ofCompany.filter((s) => s !== 'FILTERED_OUT').length)),
  ).toBeVisible();

  await dialog.getByLabel('Hide Filtered out').uncheck();
  await expect(dialog.getByText(counted(ofCompany.length))).toBeVisible();

  await dialog.getByLabel('Context', { exact: true }).check();
  await expect(dialog.getByLabel('Hide Filtered out')).toBeDisabled();
  await expect(
    dialog.getByText(counted(ofCompany.filter((s) => context.includes(s)).length)),
  ).toBeVisible();

  await dialog.getByLabel('All', { exact: true }).check();
  await expect(dialog.getByText(counted(ofCompany.length))).toBeVisible();

  // Details opens a new tab: the modal stays.
  const row = dialog
    .getByRole('row')
    .filter({ has: page.getByText(/^#\d+$/) })
    .first();
  const id = Number((await row.getByText(/^#\d+$/).textContent())?.slice(1));
  const { title: rowTitle } = await db.vacancy.findUniqueOrThrow({ where: { id } });
  const [details] = await Promise.all([
    page.waitForEvent('popup'),
    row.getByRole('link', { name: 'Open vacancy details' }).click(),
  ]);
  await expect(details).toHaveURL(/\/vacancies\/\d+$/);
  await expect(details.getByRole('heading', { level: 1, name: rowTitle })).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('Sign out lands on /login, and a guarded route then sends there too', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/vacancies');
  await expect(page).toHaveURL(/\/login$/);
});

test('a 401 mid-session lands on /login', async ({ page, db }) => {
  await page.goto('/vacancies');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await db.session.deleteMany(); // the session ends under the open page
  // A request, not a navigation: the router guard checks only on navigation.
  await page.getByRole('searchbox', { name: 'Search company or role' }).fill('Engineer');
  await expect(page).toHaveURL(/\/login$/);
});
