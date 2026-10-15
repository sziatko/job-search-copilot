import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createLocalJWKSet, jwtVerify } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signIn } from './test-app';

// JSC as an OAuth 2.1 authorization server for MCP clients (ADR-0035).
describe('OAuth authorization server (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = getPrisma();
  const issuer = `${process.env.BETTER_AUTH_URL}/api/auth`;
  const mcpUrl = process.env.MCP_PUBLIC_URL ?? '';
  const redirectUri = 'http://localhost:6274/oauth/callback'; // the MCP Inspector's

  /**
   * RFC 7591, as the MCP Inspector does it: anonymous, public (PKCE, no secret), and
   * `native` — the default `web` refuses a loopback redirect URI.
   */
  async function register() {
    const res = await request(app.getHttpServer())
      .post('/api/auth/oauth2/register')
      .send({
        client_name: 'Test MCP client',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      })
      .expect(201);
    return res.body as { client_id: string; client_secret?: string };
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await prisma.oauthClient.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  it('serves its metadata at the root, where RFC 8414 puts it, to anyone', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/.well-known/oauth-authorization-server/api/auth')
      .expect(200);
    expect(body).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/oauth2/authorize`,
      token_endpoint: `${issuer}/oauth2/token`,
      registration_endpoint: `${issuer}/oauth2/register`,
      jwks_uri: `${issuer}/jwks`,
      code_challenge_methods_supported: ['S256'],
    });
    expect(body.token_endpoint_auth_methods_supported).toContain('none');
  });

  it('registers a client over DCR with no session, linked to the MCP resource', async () => {
    const client = await register();
    expect(client.client_id).toEqual(expect.any(String));
    expect(client.client_secret).toBeUndefined();

    const row = await prisma.oauthClient.findUniqueOrThrow({
      where: { clientId: client.client_id },
      include: { oauthclientresources: true },
    });
    expect(row.redirectUris).toEqual([redirectUri]);
    expect(row.oauthclientresources.map((r) => r.resourceId)).toEqual([mcpUrl]);
  });

  it('publishes a public signing key at the JWKS endpoint, to anyone', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/auth/jwks').expect(200);
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({ kid: expect.any(String), alg: expect.any(String) });
    expect(body.keys[0]).not.toHaveProperty('d'); // no private part
  });

  // The whole flow an MCP client runs, ending in what the MCP server checks.
  it('issues a JWT for the MCP resource after sign-in and consent (code + PKCE)', async () => {
    const server = app.getHttpServer();
    const { client_id } = await register();
    const { cookie } = await signIn(app);
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const authorize = await request(server)
      .get('/api/auth/oauth2/authorize')
      .query({
        response_type: 'code',
        client_id,
        redirect_uri: redirectUri,
        scope: 'openid',
        state: 'xyz',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: mcpUrl,
      })
      .set('Cookie', cookie)
      .expect(302);
    const consentPage = new URL(authorize.headers.location);
    expect(`${consentPage.origin}${consentPage.pathname}`).toBe(
      `${process.env.WEB_ORIGIN}/consent`,
    );

    // What /consent's "Allow" sends: the signed query it was opened with.
    const consent = await request(server)
      .post('/api/auth/oauth2/consent')
      .set('Cookie', cookie)
      .set('Origin', process.env.WEB_ORIGIN ?? '')
      .send({ accept: true, oauth_query: consentPage.search.slice(1) })
      .expect(200);
    const back = new URL(consent.body.url);
    expect(back.searchParams.get('state')).toBe('xyz');

    const token = await request(server)
      .post('/api/auth/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: back.searchParams.get('code'),
        redirect_uri: redirectUri,
        client_id,
        code_verifier: verifier,
        resource: mcpUrl,
      })
      .expect(200);

    const jwks = createLocalJWKSet((await request(server).get('/api/auth/jwks')).body);
    const { payload } = await jwtVerify(token.body.access_token, jwks, {
      issuer,
      audience: mcpUrl,
    });
    expect(payload.sub).toEqual(expect.any(String));
  });
});
