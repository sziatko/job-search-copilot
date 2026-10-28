import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAuth, getPrisma } from '@job-search-copilot/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpApp } from './http-app';

// The API is not in-process here, so tokens are signed with a local key set the way the
// API's `jwt` plugin signs them (EdDSA, `typ: at+jwt`, iss/aud/client_id/scope).
const mcpUrl = 'http://localhost:3001/mcp';
const issuer = 'http://localhost:3000/api/auth';
const { privateKey, publicKey } = await generateKeyPair('EdDSA');
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1' }] });

function token(audience = mcpUrl) {
  return new SignJWT({ client_id: 'inspector', azp: 'inspector', scope: 'openid' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1', typ: 'at+jwt' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

/** The key owners `apiKey` made, deleted in `afterAll`. */
const owners: string[] = [];

/** What /profile's "Create" does: an API key for a new user, through the API's auth. */
async function apiKey(): Promise<string> {
  const prisma = getPrisma();
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: 'Key Owner', email: `${randomUUID()}@example.com` },
  });
  owners.push(user.id);
  const provider = { clientId: 'test-client-id', clientSecret: 'test-client-secret' };
  const auth = createAuth(prisma, {
    secret: 'test-secret-at-least-32-characters-long',
    baseURL: 'http://localhost:3000',
    webOrigin: 'http://localhost:5173',
    google: provider,
    linkedin: provider,
    allowedEmails: [user.email],
    passkeyRpId: 'localhost',
    mcpUrl,
  });
  return (await auth.api.createApiKey({ body: { name: 'cli', userId: user.id } })).key;
}

describe('MCP over HTTP', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createHttpApp({ mcpUrl, issuer, jwks }).listen(0, resolve);
    });
    // `localhost`, not 127.0.0.1: the Host header must match MCP_PUBLIC_URL's host.
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await getPrisma().user.deleteMany({ where: { id: { in: owners } } }); // keys cascade
  });

  const initialize = (headers: Record<string, string> = {}) =>
    fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      }),
    });

  it('serves the protected-resource document naming JSC as the authorization server', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource: mcpUrl,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
    });
  });

  it('answers a call without a token with 401 and where to find the metadata', async () => {
    const res = await initialize();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(
      'resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('reads no body before the caller is known: malformed JSON without a token is a 401', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(401);
  });

  it('lists the tools for a valid token', async () => {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${await token()}` } },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(15);
    await client.close();
  });

  it('lists the tools for an API key', async () => {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${await apiKey()}` } },
      }),
    );
    expect((await client.listTools()).tools).toHaveLength(15);
    await client.close();
  });

  it('refuses an unknown API key', async () => {
    const res = await initialize({ Authorization: 'Bearer jsc_not-a-key' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('answers 429 to an API key over its rate limit', async () => {
    const key = await apiKey();
    await getPrisma().apikey.updateMany({
      where: { referenceId: owners.at(-1) },
      data: { rateLimitMax: 1 },
    });
    expect((await initialize({ Authorization: `Bearer ${key}` })).status).toBe(200);
    expect((await initialize({ Authorization: `Bearer ${key}` })).status).toBe(429);
  });

  it('refuses a token issued for another audience', async () => {
    const res = await initialize({
      Authorization: `Bearer ${await token('http://localhost:9999/other')}`,
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });
});
