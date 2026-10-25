import { randomBytes } from 'node:crypto';
import { type ApiKeyConfigurationOptions, apiKey } from '@better-auth/api-key';
import type { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { RateLimitedError } from '../domain/errors';

/**
 * The api-key plugin's options, one const for `createAuth` (which issues keys) and the
 * verifier below (which checks them): a different prefix or hasher on one side and no
 * key would verify (ADR-0039). The rate limit is copied onto each key when it is
 * created, and read from the key's row after that; the migration
 * `20261025120000_api_key_rate_limit` set it on the keys made before.
 *
 * Limit: the window restarts only after `timeWindow` with no request at all — each
 * request moves `lastRequest` — so it is 1000 calls per busy stretch, not per clock hour.
 */
export const API_KEY_OPTIONS = {
  defaultPrefix: 'jsc_',
  // A scoring run is ~100 MCP calls; n8n's daily check reads a few pages.
  rateLimit: { enabled: true, timeWindow: 60 * 60 * 1000, maxRequests: 1000 },
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
 * Each valid call stamps the key's `lastRequest` and counts against its rate limit;
 * a key over it throws RateLimitedError — a 429, not the 401 of a bad key.
 */
export async function verifyApiKey(prisma: PrismaClient, key: string): Promise<string | null> {
  let verifier = verifiers.get(prisma);
  if (!verifier) {
    verifier = createVerifier(prisma);
    verifiers.set(prisma, verifier);
  }
  const result = await verifier.api.verifyApiKey({ body: { key } });
  if (result.error?.code === 'RATE_LIMITED') {
    throw new RateLimitedError('This API key is over its rate limit; try again later');
  }
  return result.valid ? (result.key?.referenceId ?? null) : null;
}
