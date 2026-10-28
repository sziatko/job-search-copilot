import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { AUTH_URL } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

// What the API's /oauth2/authorize appends to the consent page: the client's request,
// the list of signed parameters (`ba_param`), the signature.
const SIGNED =
  'client_id=c1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&scope=openid+offline_access&exp=1&ba_param=client_id&ba_param=exp&ba_param=redirect_uri&ba_param=scope&sig=s1';
const PATH = `/consent?${SIGNED}`;

function renderConsent() {
  // `oauthProviderClient` reads the query from the real URL, the router from its history.
  window.history.replaceState(null, '', PATH);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [PATH] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
}

describe('/consent', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it.each([
    ['Allow', true],
    ['Deny', false],
  ])(
    'names the client and its scopes; %s posts the answer with the signed request',
    async (button, accept) => {
      let body: unknown;
      mswServer.use(
        http.get(`${AUTH_URL}/oauth2/public-client`, ({ request }) =>
          HttpResponse.json({
            client_id: new URL(request.url).searchParams.get('client_id'),
            client_name: 'Claude',
          }),
        ),
        http.post(`${AUTH_URL}/oauth2/consent`, async ({ request }) => {
          body = await request.json();
          // `redirect: false`: jsdom cannot leave for the client.
          return HttpResponse.json({ redirect: false, url: 'https://claude.ai/cb?code=x' });
        }),
      );
      renderConsent();

      expect(
        await screen.findByRole('heading', { name: 'Claude wants to use Job Search Copilot' }),
      ).toBeVisible();
      expect(screen.getByText(/openid, offline_access/)).toBeVisible();
      expect(screen.getByText('Allow returns you to claude.ai.')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: button }));

      await waitFor(() => expect(body).toBeDefined());
      expect(body).toEqual({ accept, oauth_query: SIGNED });
    },
  );
});
