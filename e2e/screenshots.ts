import path from 'node:path';
import { expect, test } from './fixtures';

/**
 * The README's screenshots, on the made-up seed: `npm run screenshots`.
 * Not a test — it asserts nothing but that the page finished loading — and only the
 * `screenshots` project runs it (playwright.config.ts), so `npm run test:e2e` never does.
 */
const out = path.resolve(__dirname, '..', 'docs', 'screenshots');

test.use({ viewport: { width: 1440, height: 900 } });

for (const theme of ['light', 'dark'] as const) {
  test(theme, async ({ page, db }) => {
    await page.addInitScript((t) => localStorage.setItem('jsc-theme', t), theme);
    // A row with an analysis and a long status history.
    const { id } = await db.vacancy.findFirstOrThrow({
      where: { status: 'INTERVIEW', recommendation: { not: null } },
      orderBy: { id: 'asc' },
    });
    const screens = {
      dashboard: '/',
      vacancies: '/vacancies',
      vacancy: `/vacancies/${id}`,
      applications: '/applications',
      inbox: '/inbox',
    };
    for (const [name, url] of Object.entries(screens)) {
      await page.goto(url);
      // Mounted first: before that there are no skeletons either (vite dev's first load).
      await expect(page.locator('#root')).not.toBeEmpty();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.skeleton')).toHaveCount(0);
      if (name === 'applications') {
        // Picture only: nine tiles wrap at 1440 px, so the least telling one, Applied,
        // is hidden to keep the strip on one row. The app itself shows it.
        await page
          .locator('.kpi-tile', { has: page.locator('.kpi-label', { hasText: /^Applied$/ }) })
          .evaluate((tile) => {
            (tile as HTMLElement).style.display = 'none';
          });
      }
      await page.screenshot({ path: path.join(out, `${name}-${theme}.png`) });
    }
  });
}
