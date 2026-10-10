import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAuth, createPrismaClient, resetToSeed } from '@job-search-copilot/core';
import type { FullConfig } from '@playwright/test';
import { makeSignature } from 'better-auth/crypto';
import { env, takeSnapshot } from './db';

/**
 * Once per run, after the webServers are up (and `prepare-db.ts` has migrated): the
 * seed, a signed-in user whose cookie becomes the tests' `storageState`, then the
 * snapshot every test is restored from (`fixtures.ts`).
 */
export default async function globalSetup(config: FullConfig) {
  const db = createPrismaClient(env('DATABASE_URL'));
  try {
    await resetToSeed(db); // refuses a database not named *_e2e / *_test / *_demo

    // The session as `signIn()` in apps/api/test/test-app.ts makes it: through Better
    // Auth's own adapter, the cookie signed as Better Auth signs it (ADR-0037).
    const auth = createAuth(db, {
      secret: env('BETTER_AUTH_SECRET'),
      baseURL: env('BETTER_AUTH_URL'),
      webOrigin: env('WEB_ORIGIN'),
      google: { clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET') },
      linkedin: {
        clientId: env('LINKEDIN_CLIENT_ID'),
        clientSecret: env('LINKEDIN_CLIENT_SECRET'),
      },
      allowedEmails: env('AUTH_ALLOWED_EMAILS').split(','),
      passkeyRpId: env('PASSKEY_RP_ID'),
      mcpUrl: env('MCP_PUBLIC_URL'),
    });
    const ctx = await auth.$context;
    const email = env('AUTH_ALLOWED_EMAILS').split(',')[0].trim();
    const user =
      (await ctx.internalAdapter.findUserByEmail(email))?.user ??
      (await ctx.internalAdapter.createUser(
        { email, name: 'E2E User', emailVerified: true },
        { method: 'admin' },
      ));
    await db.session.deleteMany(); // the last run's
    const { token } = await ctx.internalAdapter.createSession(user.id);

    const storageState = config.projects[0].use.storageState as string;
    mkdirSync(path.dirname(storageState), { recursive: true });
    writeFileSync(
      storageState,
      JSON.stringify({
        cookies: [
          {
            name: ctx.authCookies.sessionToken.name,
            value: `${token}.${await makeSignature(token, ctx.secret)}`,
            domain: new URL(env('BETTER_AUTH_URL')).hostname,
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      }),
    );

    await takeSnapshot(db);
  } finally {
    await db.$disconnect();
  }
}
