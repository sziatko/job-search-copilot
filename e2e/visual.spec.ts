import { SEED_VACANCIES } from '@job-search-copilot/core';
import type { Page } from '@playwright/test';
import { VISUAL_NOW } from './clock';
import { expect, test } from './fixtures';

/**
 * Every page, dialog and empty state as a screenshot, in both themes; the `desktop` and
 * `phone` projects give the two viewports. Only the visual run has those projects
 * (`npm run test:visual`, in the Playwright image — ADR-0037); its baselines are Linux's.
 */

/** Loaded: mounted, nothing in flight, no skeleton or "Loading…" left. */
async function settle(page: Page) {
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
}

/** The vacancies table's first row, where every row action is. */
const firstRow = (page: Page) =>
  page
    .getByRole('row')
    .filter({ has: page.getByText(/^#\d+$/) })
    .first();

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(VISUAL_NOW);
      await page.addInitScript((t) => localStorage.setItem('jsc-theme', t), theme);
    });

    // Exact: every size is a whole pixel (index.css), so no text lands on a sub-pixel
    // that Chromium rasterises differently from run to run.
    const shot = (page: Page, name: string, fullPage = true) =>
      expect(page).toHaveScreenshot(`${name}-${theme}.png`, { fullPage });

    for (const [name, path] of [
      ['dashboard', '/'],
      ['inbox', '/inbox'],
      ['vacancies', '/vacancies'],
      ['applications', '/applications'],
      ['profile', '/profile'],
    ]) {
      test(name, async ({ page }) => {
        await open(page, path);
        await shot(page, name);
      });
    }

    test('vacancy', async ({ page, db }) => {
      // A row with an analysis and a long status history.
      const { id } = await db.vacancy.findFirstOrThrow({
        where: { status: 'INTERVIEW', recommendation: { not: null } },
        orderBy: { id: 'asc' },
      });
      await open(page, `/vacancies/${id}`);
      await shot(page, 'vacancy');
    });

    test.describe('signed out', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test('login', async ({ page }) => {
        await open(page, '/login');
        await shot(page, 'login');
      });
    });

    for (const [name, button] of [
      ['apply', { name: 'Apply', exact: true }],
      ['decline', { name: 'Decline' }],
      ['save-for-later', { name: 'Save for later' }],
      ['company-history', { name: /other vacanc(y|ies) at / }],
    ] as const) {
      test(`${name} dialog`, async ({ page }) => {
        await open(page, '/vacancies');
        await firstRow(page).getByRole('button', button).click();
        await settle(page);
        await shot(page, `${name}-dialog`, false);
      });
    }

    test('search dialog', async ({ page }) => {
      await open(page, '/vacancies');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('searchbox', { name: 'Search company or role' })
        .fill(SEED_VACANCIES[0].company);
      await settle(page);
      await shot(page, 'search-dialog', false);
    });

    for (const [name, path] of [
      ['dashboard', '/'],
      ['inbox', '/inbox'],
      ['vacancies', '/vacancies'],
      ['applications', '/applications'],
    ]) {
      test(`${name}, empty`, async ({ page, db }) => {
        await db.vacancy.deleteMany(); // the next test's restore brings them back
        await open(page, path);
        await shot(page, `${name}-empty`);
      });
    }
  });
}
