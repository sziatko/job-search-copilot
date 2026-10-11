import { randomBytes } from 'node:crypto';
import { type ApiKeyConfigurationOptions, apiKey } from '@better-auth/api-key';
import type { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

/**
 * The api-key plugin's options, one const for `createAuth` (which issues keys) and the
 * verifier below (which checks them): a different prefix or hasher on one side and no
 * key would verify (ADR-0039). The plugin's rate limit is on at 10 requests a day by
 * default and is copied onto each key when it is created, so it is off from the first.
 */
export const API_KEY_OPTIONS = {
  defaultPrefix: 'jsc_',
  rateLimit: { enabled: false },
} satisfies ApiKeyConfigurationOptions;

/**
 * Verify-only: no social providers, so the MCP needs none of their secrets. `secret`
 * is random because this instance signs nothing — a cookie or token it made would
 * verify nowhere else — but Better Auth refuses to boot in production without one.
 */
function createVerifier(prisma: PrismaClient) {
  return betterAuth({
    secret: randomBytes(32).toString('hex'),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    plugins: [apiKey(API_KEY_OPTIONS)],
  });
}

const verifiers = new WeakMap<PrismaClient, ReturnType<typeof createVerifier>>();

/**
 * The id of the user who owns `key`, or null for a revoked, unknown or malformed one.
 * Each valid call stamps the key's `lastRequest`.
 */
export async function verifyApiKey(prisma: PrismaClient, key: string): Promise<string | null> {
  let verifier = verifiers.get(prisma);
  if (!verifier) {
    verifier = createVerifier(prisma);
    verifiers.set(prisma, verifier);
  }
  const result = await verifier.api.verifyApiKey({ body: { key } });
  return result.valid ? (result.key?.referenceId ?? null) : null;
}
