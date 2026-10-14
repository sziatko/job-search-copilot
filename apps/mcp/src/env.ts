import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// The MCP server runs standalone (tsx / node), so it loads the monorepo-root .env
// itself rather than relying on @job-search-copilot/core to do it. In Docker,
// DATABASE_URL is already injected and dotenv won't override an existing var.
// Imported for its side effect as the very first import of the entrypoint. `quiet`:
// stdout carries the MCP protocol, and dotenv would print a banner onto it.
loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/**
 * The stdio entrypoint's env, validated at boot (invariant 8); http.ts validates its own.
 * `JSC_API_KEY`: a key from /profile, whose owner the tools act as (ADR-0039).
 */
export function stdioEnv() {
  const parsed = z
    .object({ DATABASE_URL: z.url(), JSC_API_KEY: z.string().startsWith('jsc_') })
    .safeParse(process.env);
  if (!parsed.success) {
    console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
    process.exit(1);
  }
  return parsed.data;
}
