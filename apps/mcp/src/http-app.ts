import { getPrisma, RateLimitedError, verifyApiKey } from '@job-search-copilot/core';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { errors, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { createServer } from './server';

export interface HttpAppConfig {
  /** MCP_PUBLIC_URL — this server's URL as clients call it: the tokens' `aud` (ADR-0035). */
  mcpUrl: string;
  /** The authorization server's issuer, `${BETTER_AUTH_URL}/api/auth`: the tokens' `iss`. */
  issuer: string;
  /** JSC's public keys: the API's JWKS in the entrypoint, a local key set in tests. */
  jwks: JWTVerifyGetKey;
}

/**
 * MCP over Streamable HTTP as an OAuth 2.1 resource server (ADR-0035), over the same
 * `createServer()` as stdio (ADR-0010). Stateless: each POST gets its own server and
 * transport, so no session lives in memory. A bearer is an API key (`jsc_…`, ADR-0039),
 * checked in the database, or else a JWT the API signed, checked against the JWKS. Either
 * way the server is built for its user: the key's owner, the token's `sub` (a public
 * subject — the user's id; no `pairwiseSecret` is configured).
 */
export function createHttpApp({ mcpUrl, issuer, jwks }: HttpAppConfig) {
  const url = new URL(mcpUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(url);

  const verifier: OAuthTokenVerifier = {
    async verifyAccessToken(token) {
      // `auth` below took every valid key; one that gets here is unknown or revoked.
      if (token.startsWith('jsc_')) throw new InvalidTokenError('Invalid API key');
      try {
        // `typ: at+jwt` (RFC 9068) keeps an ID token from passing as an access token.
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience: mcpUrl,
          typ: 'at+jwt',
        });
        if (!payload.sub) throw new InvalidTokenError('Token has no subject');
        return {
          token,
          clientId: String(payload.client_id ?? payload.azp),
          scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
          expiresAt: payload.exp,
          resource: url,
          extra: { sub: payload.sub },
        };
      } catch (err) {
        // A bad token is a 401; the API unreachable (fetch failure, JWKS timeout) is a 500.
        if (err instanceof errors.JOSEError && !(err instanceof errors.JWKSTimeout)) {
          throw new InvalidTokenError(err.message);
        }
        throw err;
      }
    },
  };
  const bearer = requireBearerAuth({ verifier, resourceMetadataUrl });

  /** A key is checked here, not in `verifier`: requireBearerAuth answers anything but a
   * bad token with a 400 or a 500, and a key over its rate limit is a 429. */
  const auth: express.RequestHandler = async (req, res, next) => {
    const [scheme, key] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !key?.startsWith('jsc_')) {
      return bearer(req, res, next);
    }
    let owner: string | null;
    try {
      owner = await verifyApiKey(getPrisma(), key);
    } catch (err) {
      if (!(err instanceof RateLimitedError)) throw err;
      res.status(429).json({ error: 'too_many_requests', error_description: err.message });
      return;
    }
    if (!owner) return bearer(req, res, next); // the verifier's 401
    req.auth = { token: key, clientId: 'api-key', scopes: [], extra: { sub: owner } };
    next();
  };

  const app = express();
  // DNS-rebinding protection: only the host clients are told to call.
  app.use(hostHeaderValidation([url.hostname]));

  // RFC 9728, at the path-inserted URL the 401's WWW-Authenticate points to.
  app.get(new URL(resourceMetadataUrl).pathname, (_req, res) => {
    res.json({
      resource: mcpUrl,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
    });
  });

  // The body is parsed only once the caller is known: a stranger's 5 MB costs nothing.
  // A save_vacancies / intake_vacancies batch carries full texts — the API's limit too.
  app.post(url.pathname, auth, express.json({ limit: '5mb' }), async (req, res) => {
    const server = createServer({ userId: String(req.auth?.extra?.sub) });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  // Stateless: no SSE stream to GET, no session to DELETE.
  app.all(url.pathname, (_req, res) => {
    res.set('Allow', 'POST').status(405).end();
  });

  return app;
}
