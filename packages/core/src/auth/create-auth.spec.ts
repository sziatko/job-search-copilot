import { execFileSync } from 'node:child_process';
import { handleOAuthUserInfo } from 'better-auth/oauth2';
import { afterEach, describe, expect, it } from 'vitest';
import { getPrisma } from '../db/prisma-client';
import { RateLimitedError } from '../domain/errors';
import { verifyApiKey } from './api-key';
import { createAuth, isAllowedRedirectUri } from './create-auth';

const prisma = getPrisma();
const provider = { clientId: 'test-client-id', clientSecret: 'test-client-secret' };
const auth = createAuth(prisma, {
  secret: 'test-secret-at-least-32-characters-long',
  baseURL: 'http://localhost:3000',
  webOrigin: 'http://localhost:5173',
  google: provider,
  linkedin: provider,
  allowedEmails: [' Me@Example.com '],
  passkeyRpId: 'localhost',
  mcpUrl: 'http://localhost:3001/mcp',
});

// The one user these tests sign up (the allowed email); its accounts, sessions and keys
// go with it. `tests/setup.ts` deletes only the users `createUser` made.
afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: 'me@example.com' } });
});

// What a social sign-in's callback calls once Google has vouched for the email.
async function signUpWithGoogle(email: string) {
  const ctx = await auth.$context;
  return ctx.internalAdapter.createOAuthUser(
    { email, name: 'Test User', emailVerified: true },
    { providerId: 'google', accountId: `google-sub-${email}` },
  );
}

describe('createAuth', () => {
  it('refuses to sign up an email outside AUTH_ALLOWED_EMAILS', async () => {
    await expect(signUpWithGoogle('stranger@example.com')).rejects.toThrow(
      'This email may not sign up',
    );
    expect(await prisma.user.count({ where: { email: 'stranger@example.com' } })).toBe(0);
    expect(
      await prisma.account.count({ where: { accountId: 'google-sub-stranger@example.com' } }),
    ).toBe(0);
  });

  it('refuses to sign up an allowed email the provider has not verified', async () => {
    const ctx = await auth.$context;
    await expect(
      ctx.internalAdapter.createOAuthUser(
        { email: 'me@example.com', name: 'Someone', emailVerified: false },
        { providerId: 'linkedin', accountId: 'li-unverified' },
      ),
    ).rejects.toThrow('This email may not sign up');
    expect(await prisma.user.count({ where: { email: 'me@example.com' } })).toBe(0);
  });

  it('signs up an allowed email, whatever its case, and writes a session for it', async () => {
    const { user } = await signUpWithGoogle('ME@example.com');
    expect(user.email).toBe('me@example.com');
    expect(await prisma.account.findFirst({ where: { userId: user.id } })).toMatchObject({
      providerId: 'google',
    });

    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(user.id);
    expect(await prisma.session.findUnique({ where: { token: session.token } })).toMatchObject({
      userId: user.id,
    });
    expect((await ctx.internalAdapter.findSession(session.token))?.user.id).toBe(user.id);
  });

  it('will not link a second provider whose email is unverified (no trustedProviders)', async () => {
    await signUpWithGoogle('me@example.com');
    const context = await auth.$context;
    // The refusal path reads only `c.context`; a full endpoint context is not needed.
    const result = await handleOAuthUserInfo({ context } as never, {
      userInfo: { id: 'li-sub', email: 'me@example.com', emailVerified: false, name: 'Someone' },
      account: { providerId: 'linkedin', accountId: 'li-sub' },
    });
    expect(result.error).toBe('account not linked');
    expect(await prisma.account.count({ where: { user: { email: 'me@example.com' } } })).toBe(1);
  });
});

describe('isAllowedRedirectUri', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:6274/oauth/callback',
    'http://127.0.0.1:46544/callback',
    'http://[::1]:8080/cb',
  ])('accepts %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(true);
  });

  it.each([
    'https://attacker.example/api/mcp/auth_callback',
    'https://claude.ai/other',
    'https://claude.ai.attacker.example/api/mcp/auth_callback',
    'https://localhost/cb',
    'http://localhost.attacker.example/cb',
    'not a url',
  ])('refuses %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false);
  });
});

describe('API keys', () => {
  // What /profile's "Create" does, as the signed-in user; the key comes back once.
  async function createKey() {
    const { user } = await signUpWithGoogle('me@example.com');
    const created = await auth.api.createApiKey({ body: { name: 'n8n', userId: user.id } });
    return { userId: user.id, key: created.key, id: created.id };
  }

  it('issues a jsc_ key, stored hashed, that verifies to its owner', async () => {
    const { userId, key, id } = await createKey();
    expect(key).toMatch(/^jsc_/);
    const row = await prisma.apikey.findUniqueOrThrow({ where: { id } });
    expect(row.key).not.toBe(key);
    expect(row).toMatchObject({
      rateLimitEnabled: true,
      rateLimitTimeWindow: 3_600_000,
      rateLimitMax: 1000,
    });

    expect(await verifyApiKey(prisma, key)).toBe(userId);
    expect(await verifyApiKey(prisma, key)).toBe(userId);
    const used = await prisma.apikey.findUniqueOrThrow({ where: { id } });
    expect(used.lastRequest).toBeInstanceOf(Date);
  });

  it('throws RateLimitedError once a key is over its limit, read from its row', async () => {
    const { userId, key, id } = await createKey();
    await prisma.apikey.update({ where: { id }, data: { rateLimitMax: 2 } });
    expect(await verifyApiKey(prisma, key)).toBe(userId);
    expect(await verifyApiKey(prisma, key)).toBe(userId);
    await expect(verifyApiKey(prisma, key)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('verifies a revoked key, and garbage, to null', async () => {
    const { key, id } = await createKey();
    await prisma.apikey.delete({ where: { id } });
    expect(await verifyApiKey(prisma, key)).toBeNull();
    expect(await verifyApiKey(prisma, 'jsc_not-a-key')).toBeNull();
    expect(await verifyApiKey(prisma, '')).toBeNull();
  });

  // Better Auth reads NODE_ENV once, when it loads, and refuses production without a
  // secret — so a process of its own: the MCP's env carries no BETTER_AUTH_SECRET.
  it('boots with NODE_ENV=production and no auth env', () => {
    const script = `
      const { verifyApiKey } = await import('./src/auth/api-key.ts');
      const { createPrismaClient } = await import('./src/db/prisma-client.ts');
      const db = createPrismaClient(process.env.DATABASE_URL);
      process.stdout.write(String(await verifyApiKey(db, 'jsc_not-a-key')));
      await db.$disconnect();`;
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: new URL('../..', import.meta.url),
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: process.env.DATABASE_URL,
          NODE_ENV: 'production',
        },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    expect(out.toString()).toBe('null');
  }, 30_000); // a cold tsx start, ~7 s
});
