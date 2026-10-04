import { describe, expect, it } from 'vitest';
import { getPrisma } from '../prisma-client';
import { createAuth } from './create-auth';

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
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.account.count()).toBe(0);
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
});
