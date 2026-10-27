import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createLocalJWKSet, jwtVerify } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, deleteTestUsers, signIn } from './test-app';

// JSC as an OAuth 2.1 authorization server for MCP clients (ADR-0035).
describe('OAuth authorization server (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = getPrisma();
  const issuer = `${process.env.BETTER_AUTH_URL}/api/auth`;
  const mcpUrl = process.env.MCP_PUBLIC_URL ?? '';
  const redirectUri = 'http://localhost:6274/oauth/callback'; // the MCP Inspector's

  /** The clients `register` made; anonymous, so no user's cascade deletes them. */
  const clients: string[] = [];

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
    clients.push(res.body.client_id);
    return res.body as { client_id: string; client_secret?: string };
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await prisma.oauthClient.deleteMany({ where: { clientId: { in: clients } } });
    await deleteTestUsers();
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
    // At least one: the key is made on first use, and test files signing in at the same
    // time on a fresh database can each make one.
    expect(body.keys.length).toBeGreaterThan(0);
    for (const key of body.keys) {
      expect(key).toMatchObject({ kid: expect.any(String), alg: expect.any(String) });
      expect(key).not.toHaveProperty('d'); // no private part
    }
  });

  // Registration is open, so a stranger can register; the code still never reaches them.
  it('never sends a signed-in user to consent for a callback off the allowed list', async () => {
    const server = app.getHttpServer();
    const evil = 'https://attacker.example/api/mcp/auth_callback';
    const res = await request(server)
      .post('/api/auth/oauth2/register')
      .send({ client_name: 'Claude', redirect_uris: [evil], token_endpoint_auth_method: 'none' })
      .expect(201);
    clients.push(res.body.client_id);
    const { cookie } = await signIn(app);

    const authorize = await request(server)
      .get('/api/auth/oauth2/authorize')
      .query({
        response_type: 'code',
        client_id: res.body.client_id,
        redirect_uri: evil,
        scope: 'openid',
        code_challenge: createHash('sha256').update('v').digest('base64url'),
        code_challenge_method: 'S256',
        resource: mcpUrl,
      })
      .set('Cookie', cookie);
    const location = authorize.headers.location ?? '';
    expect(location).not.toContain('/consent');
    expect(location).not.toContain('attacker.example');
  });

  /** The whole flow an MCP client runs: register, sign-in, consent, code + PKCE → tokens. */
  async function connect(scope: string) {
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
        scope,
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
    return { client_id, cookie, tokens: token.body as Record<string, string> };
  }

  /** A refresh, as the client does it when its access token runs out. */
  function refresh(client_id: string, refresh_token: string) {
    return request(app.getHttpServer())
      .post('/api/auth/oauth2/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token, client_id, resource: mcpUrl });
  }

  it('issues a JWT for the MCP resource after sign-in and consent (code + PKCE)', async () => {
    const { tokens } = await connect('openid');
    const server = app.getHttpServer();
    const jwks = createLocalJWKSet((await request(server).get('/api/auth/jwks')).body);
    const { payload } = await jwtVerify(tokens.access_token, jwks, {
      issuer,
      audience: mcpUrl,
    });
    expect(payload.sub).toEqual(expect.any(String));
  });

  // /profile's "Connected apps": Revoke must end the grant, not only hide the consent.
  it('revoking a consent ends its refresh grant, and only the owner can revoke it', async () => {
    const server = app.getHttpServer();
    const { client_id, cookie, tokens } = await connect('openid offline_access');
    const { body: consents } = await request(server)
      .get('/api/auth/oauth2/get-consents')
      .set('Cookie', cookie)
      .expect(200);
    expect(consents).toHaveLength(1);
    expect(consents[0].clientId).toBe(client_id);

    const stranger = await signIn(app);
    await request(server)
      .post('/api/auth/oauth2/delete-consent')
      .set('Cookie', stranger.cookie)
      .set('Origin', process.env.WEB_ORIGIN ?? '')
      .send({ id: consents[0].id })
      .expect(401);
    const refreshed = await refresh(client_id, tokens.refresh_token).expect(200);

    await request(server)
      .post('/api/auth/oauth2/delete-consent')
      .set('Cookie', cookie)
      .set('Origin', process.env.WEB_ORIGIN ?? '')
      .send({ id: consents[0].id })
      .expect(200);
    await refresh(client_id, refreshed.body.refresh_token).expect(400);
  });
});
