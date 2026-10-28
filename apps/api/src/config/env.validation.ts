import { z } from 'zod';

/**
 * Shape + coercion for the environment the API needs. Run by ConfigModule at boot
 * (see app.module.ts): a missing/non-URL DATABASE_URL or a non-numeric API_PORT
 * fails startup with a readable message instead of surfacing as a confusing error
 * deep in a request later.
 */
const envSchema = z.object({
  /** `production` in the production image (its Dockerfile); turns the Swagger UI off. */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Signs session cookies (ADR-0034). `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The API's public origin; OAuth callbacks are built from it. */
  BETTER_AUTH_URL: z.url(),
  /** The web's origin, exactly: the CORS allowlist and Better Auth's trustedOrigins. No
   * `*`: `URL` takes `https://*.example.com` as an origin, and Better Auth would read it
   * as a wildcard. */
  WEB_ORIGIN: z.url().refine((url) => new URL(url).origin === url && !url.includes('*'), {
    message:
      'must be one bare origin, e.g. http://localhost:5173 (no path, no trailing slash, no *)',
  }),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  LINKEDIN_CLIENT_ID: z.string().min(1),
  LINKEDIN_CLIENT_SECRET: z.string().min(1),
  /** Comma-separated: the only emails that may sign up. */
  AUTH_ALLOWED_EMAILS: z
    .string()
    .transform((list) =>
      list
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.email()).min(1)),
  /** The passkeys' relying party id (`localhost` in dev); changing it voids them all. */
  PASSKEY_RP_ID: z.string().min(1),
  /** The MCP server's URL as clients call it: the audience of the tokens JSC issues (ADR-0035). */
  MCP_PUBLIC_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
