import { createPrismaClient, type PrismaClient } from '@job-search-copilot/core';
import { test as base } from '@playwright/test';
import { env, restoreSnapshot } from './db';

/**
 * Every spec imports `test` and `expect` from here, not from `@playwright/test`: each
 * test then starts from the seed (the snapshot global setup took), signed in. `db` is
 * the e2e database, for a test that sets up or checks rows itself.
 */
export const test = base.extend<{ seeded: undefined }, { db: PrismaClient }>({
  db: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright wants a destructured first argument
    async ({}, use) => {
      const db = createPrismaClient(env('DATABASE_URL'));
      await use(db);
      await db.$disconnect();
    },
    { scope: 'worker' },
  ],
  seeded: [
    async ({ db }, use) => {
      await restoreSnapshot(db);
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
