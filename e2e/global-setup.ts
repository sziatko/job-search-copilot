import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createPrismaClient, resetToSeed } from '@job-search-copilot/core';
import type { FullConfig } from '@playwright/test';
import { env, takeSnapshot } from './db';
import { e2eAuth, sessionCookie } from './session';

/**
 * Once per run, after the webServers are up (and `prepare-db.ts` has migrated): a
 * signed-in user whose cookie becomes the tests' `storageState`, the seed as that
 * user's data, then the snapshot every test is restored from (`fixtures.ts`).
 */
export default async function globalSetup(config: FullConfig) {
  const db = createPrismaClient(env('DATABASE_URL'));
  try {
    const auth = e2eAuth(db);
    const ctx = await auth.$context;
    const email = env('AUTH_ALLOWED_EMAILS').split(',')[0].trim();
    const user =
      (await ctx.internalAdapter.findUserByEmail(email))?.user ??
      (await ctx.internalAdapter.createUser(
        { email, name: 'E2E User', emailVerified: true },
        { method: 'admin' },
      ));
    // Refuses a database not named *_e2e / *_test / *_demo.
    await resetToSeed(db, user.id);
    await db.session.deleteMany(); // the last run's
    const cookie = await sessionCookie(auth, user.id);

    const storageState = config.projects[0].use.storageState as string;
    mkdirSync(path.dirname(storageState), { recursive: true });
    writeFileSync(storageState, JSON.stringify({ cookies: [cookie], origins: [] }));

    await takeSnapshot(db);
  } finally {
    await db.$disconnect();
  }
}
