import { DEFAULT_OAUTH_SCOPES, oauthProvider } from '@better-auth/oauth-provider';
import { passkey } from '@better-auth/passkey';
import type { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';

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
  /**
   * MCP_PUBLIC_URL — the MCP server's URL exactly as clients call it: the one resource
   * access tokens are issued for, their `aud` (ADR-0035).
   */
  mcpUrl: string;
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
    // The jwt plugin's own GET /token hands a session's JWT to the browser; the OAuth
    // provider issues tokens at /oauth2/token instead (Better Auth's docs disable it).
    disabledPaths: ['/token'],
    plugins: [
      passkey({ rpID: config.passkeyRpId, rpName: 'Job Search Copilot', origin: config.webOrigin }),
      // Signs access tokens with JSC's own key (the `Jwks` table), served at /api/auth/jwks.
      jwt(),
      // JSC as an OAuth 2.1 authorization server for MCP clients (ADR-0035). Its issuer is
      // `${baseURL}/api/auth`. The login and consent pages are the web's.
      oauthProvider({
        loginPage: `${config.webOrigin}/login`,
        consentPage: `${config.webOrigin}/consent`,
        // RFC 7591, open: an MCP client (Claude, the Inspector) registers itself without
        // a session. A client still gets no token until the user signs in and consents.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // A token is a JWT only when the client asks for this resource (RFC 8707), as MCP
        // clients do; every registered client may.
        // `allowedScopes` spelled out: left out, the plugin writes null, which Prisma
        // refuses for a list column. All of them is what null means: no restriction.
        resources: [{ identifier: config.mcpUrl, allowedScopes: [...DEFAULT_OAUTH_SCOPES] }],
        clientRegistrationDefaultResources: [config.mcpUrl],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
