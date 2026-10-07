import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { AUTH_URL, buildHandlers, sessionHandler, statsHandler } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
  return router;
}

describe('sign-in', () => {
  it('sends a visitor with no session to /login, outside the shell', async () => {
    mswServer.use(sessionHandler(false));
    const router = renderAt('/vacancies');

    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /continue with linkedin/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /sign in with a passkey/i })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('link', { name: /analyzed vacancies/i })).not.toBeInTheDocument();
  });

  it('starts a Google sign-in that comes back to the web, not to the API', async () => {
    let body: unknown;
    mswServer.use(
      http.post(`${AUTH_URL}/sign-in/social`, async ({ request }) => {
        body = await request.json();
        // `redirect: false`: jsdom cannot leave for Google.
        return HttpResponse.json({ url: 'https://accounts.google.com/o', redirect: false });
      }),
    );
    renderAt('/login');

    await userEvent.click(await screen.findByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({
      provider: 'google',
      callbackURL: `${window.location.origin}/`,
      errorCallbackURL: `${window.location.origin}/login`,
    });
  });

  it("shows the error a failed social sign-in's callback came back with", async () => {
    renderAt('/login?error=unable_to_create_user');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in failed: unable to create user',
    );
  });

  it("keeps an MCP client's signed request in the URL, for sign-in to post back", async () => {
    const router = renderAt('/login?client_id=c1&ba_param=client_id&sig=s1');
    await screen.findByRole('button', { name: /sign in with a passkey/i });
    expect(router.state.location.search).toMatchObject({ client_id: 'c1', sig: 's1' });
  });

  it('signs out and lands on /login', async () => {
    let signedOut = false;
    mswServer.use(
      ...buildHandlers([]),
      statsHandler(),
      http.post(`${AUTH_URL}/sign-out`, () => {
        signedOut = true;
        return HttpResponse.json({ success: true });
      }),
    );
    const router = renderAt('/');

    await userEvent.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeVisible();
    expect(signedOut).toBe(true);
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('the shell', () => {
  it('shows the signed-in user in the sidebar', async () => {
    mswServer.use(
      http.get(`${AUTH_URL}/get-session`, () =>
        HttpResponse.json({
          session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2099-01-01T00:00:00.000Z' },
          user: { id: 'u1', email: 'jane@example.com', name: 'Jane Doe', emailVerified: true },
        }),
      ),
      http.get(`${AUTH_URL}/passkey/list-user-passkeys`, () => HttpResponse.json([])),
    );
    renderAt('/profile');

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('JD')).toHaveClass('avatar');
  });
});

describe('passkeys on /profile', () => {
  it('lists the passkeys and removes one', async () => {
    let keys = [{ id: 'pk1', name: 'Laptop', createdAt: '2026-10-01T00:00:00.000Z' }];
    let deleted: unknown;
    mswServer.use(
      http.get(`${AUTH_URL}/passkey/list-user-passkeys`, () => HttpResponse.json(keys)),
      http.post(`${AUTH_URL}/passkey/delete-passkey`, async ({ request }) => {
        deleted = await request.json();
        keys = [];
        return HttpResponse.json({ status: true });
      }),
    );
    renderAt('/profile');

    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a passkey/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(await screen.findByText(/no passkeys yet/i)).toBeInTheDocument();
    expect(deleted).toEqual({ id: 'pk1' });
  });
});
