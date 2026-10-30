import './env';
import { createRemoteJWKSet } from 'jose';
import { z } from 'zod';
import { createHttpApp } from './http-app';

// The second entrypoint (ADR-0035): MCP over Streamable HTTP, behind OAuth or an API key
// (ADR-0039). Unlike stdio (index.ts), stdout is free here.
const envSchema = z.object({
  DATABASE_URL: z.url(),
  /** The API's public origin: the tokens' issuer is `${BETTER_AUTH_URL}/api/auth`. */
  BETTER_AUTH_URL: z.url(),
  /** Where this server reaches the API for its JWKS: BETTER_AUTH_URL on the host,
   * the API's service inside Docker (`api` in dev, `jsc-api` in prod), where `localhost`
   * is the container itself. */
  AUTH_URL: z.url(),
  /** This server's URL as clients call it; the tokens' audience. */
  MCP_PUBLIC_URL: z.url(),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3001),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
const env = parsed.data;

const app = createHttpApp({
  mcpUrl: env.MCP_PUBLIC_URL,
  issuer: `${env.BETTER_AUTH_URL}/api/auth`,
  jwks: createRemoteJWKSet(new URL('/api/auth/jwks', env.AUTH_URL)),
});

app.listen(env.MCP_HTTP_PORT, (err) => {
  if (err) throw err;
  console.log(`job-search-copilot MCP server on ${env.MCP_PUBLIC_URL} (port ${env.MCP_HTTP_PORT})`);
});
