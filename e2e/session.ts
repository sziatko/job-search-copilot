import { type Auth, createAuth, type PrismaClient } from '@job-search-copilot/core';
import { makeSignature } from 'better-auth/crypto';
import { env } from './db';

/** The app's Better Auth, on the e2e database, configured from the e2e env. */
export function e2eAuth(db: PrismaClient): Auth {
  return createAuth(db, {
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
}

/**
 * A session for `userId` and its cookie, as `signIn()` in apps/api/test/test-app.ts
 * makes them: through Better Auth's own adapter, the token signed as Better Auth signs
 * it (ADR-0037). In the shape `storageState` and `context.addCookies` take.
 */
export async function sessionCookie(auth: Auth, userId: string) {
  const ctx = await auth.$context;
  const { token } = await ctx.internalAdapter.createSession(userId);
  return {
    name: ctx.authCookies.sessionToken.name,
    value: `${token}.${await makeSignature(token, ctx.secret)}`,
    domain: new URL(env('BETTER_AUTH_URL')).hostname,
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const,
  };
}
