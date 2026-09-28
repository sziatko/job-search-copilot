import { z } from 'zod';

/**
 * Shape + coercion for the environment the API needs. Run by ConfigModule at boot
 * (see app.module.ts): a missing/non-URL DATABASE_URL or a non-numeric API_PORT
 * fails startup with a readable message instead of surfacing as a confusing error
 * deep in a request later.
 */
const envSchema = z.object({
  DATABASE_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Comma-separated CORS allowlist. Empty → reflect any origin (dev convenience). */
  CORS_ORIGINS: z.string().default(''),
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
