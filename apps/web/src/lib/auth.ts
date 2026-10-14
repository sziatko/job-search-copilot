import { apiKeyClient } from '@better-auth/api-key/client';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';
import { API_ORIGIN } from './api';

/**
 * Better Auth's browser client, against the API's /api/auth/* (phase 6). Its types come
 * from the library's plugins, not from `core` (invariant 5). The session is an
 * `HttpOnly` cookie the API sets; this client never sees a token. It sends
 * `credentials: 'include'` on its own.
 *
 * `oauthProviderClient`: mid-way through an MCP client's authorization (ADR-0035), the
 * API sends the user to /login or /consent with the request signed into the URL; this
 * plugin posts that query back with every sign-in or consent, so the API can resume it.
 *
 * `apiKeyClient`: /profile's API keys, for n8n and MCP (ADR-0039).
 */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  plugins: [passkeyClient(), oauthProviderClient(), apiKeyClient()],
  fetchOptions: {
    // The library captures `fetch` when the client is created; looked up per call
    // instead, so a test's MSW (which patches `fetch` later, in `listen()`) sees it.
    customFetchImpl: (input, init) => fetch(input, init),
  },
});
