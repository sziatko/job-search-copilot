import { passkey } from '@better-auth/passkey';
import type { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';

/**
 * What `createAuth` needs, already validated. `core` reads no env (invariant 8): the app
 * entrypoint maps its env vars onto this.
 */
export interface AuthConfig {
  /** BETTER_AUTH_SECRET — signs cookies and encrypts stored tokens. */
  secret: string;
  /** BETTER_AUTH_URL — the API's public origin; OAuth callbacks are built from it. */
  baseURL: string;
  /** WEB_ORIGIN — the only origin allowed to call /api/auth/*, and the passkeys' origin. */
  webOrigin: string;
  google: { clientId: string; clientSecret: string };
  linkedin: { clientId: string; clientSecret: string };
  /** AUTH_ALLOWED_EMAILS — the only emails that may sign up (ADR-0034). */
  allowedEmails: readonly string[];
  /** PASSKEY_RP_ID — baked into every stored passkey; changing it invalidates them all. */
  passkeyRpId: string;
}

/**
 * The Better Auth instance, on `core`'s Prisma client: every query it makes runs inside
 * `core` (invariant 1). Sign-in is Google / LinkedIn (OIDC), then passkeys; no password.
 */
export function createAuth(prisma: PrismaClient, config: AuthConfig) {
  const allowed = new Set(config.allowedEmails.map((e) => e.trim().toLowerCase()));

  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [config.webOrigin],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    socialProviders: {
      google: config.google,
      linkedin: config.linkedin,
    },
    account: {
      // A trusted provider's account links to an existing user with the same email even
      // without `email_verified` — list only providers that verify emails themselves.
      accountLinking: { enabled: true, trustedProviders: ['google', 'linkedin'] },
    },
    databaseHooks: {
      user: {
        create: {
          // Stopgap until `Vacancy` has a `userId`: any account sees all the data.
          before: async (user) => {
            if (!allowed.has(user.email.toLowerCase())) {
              throw new APIError('FORBIDDEN', { message: 'This email may not sign up' });
            }
          },
        },
      },
    },
    plugins: [
      passkey({ rpID: config.passkeyRpId, rpName: 'Job Search Copilot', origin: config.webOrigin }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
