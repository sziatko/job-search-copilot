import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/react';
import { API_ORIGIN } from './api';

/**
 * Better Auth's browser client, against the API's /api/auth/* (phase 6). Its types come
 * from the library's plugins, not from `core` (invariant 5). The session is an
 * `HttpOnly` cookie the API sets; this client never sees a token. It sends
 * `credentials: 'include'` on its own.
 */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  plugins: [passkeyClient()],
  fetchOptions: {
    // The library captures `fetch` when the client is created; looked up per call
    // instead, so a test's MSW (which patches `fetch` later, in `listen()`) sees it.
    customFetchImpl: (input, init) => fetch(input, init),
  },
});
