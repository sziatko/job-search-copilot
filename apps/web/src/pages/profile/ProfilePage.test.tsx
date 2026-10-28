import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { routeTree } from '@/router';
import { AUTH_URL } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

function renderProfile() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/profile'] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
}

/** The api-key plugin's endpoints over one in-memory list, as the API answers them. */
function apiKeyHandlers() {
  const keys: {
    id: string;
    name: string;
    start: string;
    createdAt: string;
    lastRequest: string | null;
  }[] = [
    {
      id: 'k1',
      name: 'n8n',
      start: 'jsc_Ab',
      createdAt: '2026-09-01T00:00:00.000Z',
      lastRequest: '2026-09-02T00:00:00.000Z',
    },
  ];
  return [
    http.get(`${AUTH_URL}/passkey/list-user-passkeys`, () => HttpResponse.json([])),
    http.get(`${AUTH_URL}/oauth2/get-consents`, () => HttpResponse.json([])),
    http.get(`${AUTH_URL}/api-key/list`, () =>
      HttpResponse.json({ apiKeys: keys, total: keys.length }),
    ),
    http.post(`${AUTH_URL}/api-key/create`, async ({ request }) => {
      const { name } = (await request.json()) as { name: string };
      const created = {
        id: 'k2',
        name,
        start: 'jsc_Cd',
        createdAt: '2026-09-03T00:00:00.000Z',
        lastRequest: null,
      };
      keys.push(created);
      return HttpResponse.json({ ...created, key: 'jsc_Cd-made-up-secret' });
    }),
    http.post(`${AUTH_URL}/api-key/delete`, async ({ request }) => {
      const { keyId } = (await request.json()) as { keyId: string };
      keys.splice(
        keys.findIndex((k) => k.id === keyId),
        1,
      );
      return HttpResponse.json({ success: true });
    }),
  ];
}

describe('/profile: API keys', () => {
  it('lists the keys: name, start, created, last used', async () => {
    mswServer.use(...apiKeyHandlers());
    renderProfile();

    const row = (await screen.findByText('n8n')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('jsc_Ab…');
    expect(row).toHaveTextContent(`created ${new Date('2026-09-01').toLocaleDateString()}`);
    expect(row).toHaveTextContent(`last used ${new Date('2026-09-02').toLocaleDateString()}`);
  });

  it('creates a key, shows it once with Copy, and lists it', async () => {
    const user = userEvent.setup();
    mswServer.use(...apiKeyHandlers());
    renderProfile();

    await user.type(await screen.findByLabelText('Key name'), 'Claude Desktop');
    await user.click(screen.getByRole('button', { name: 'Create a key' }));

    expect(await screen.findByText('jsc_Cd-made-up-secret')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe('jsc_Cd-made-up-secret');
    const row = (await screen.findByText('Claude Desktop')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('never used');
    expect(screen.getByLabelText('Key name')).toHaveValue('');
  });

  it('revokes a key', async () => {
    const user = userEvent.setup();
    mswServer.use(...apiKeyHandlers());
    renderProfile();

    const row = (await screen.findByText('n8n')).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText(/No API keys yet/)).toBeVisible();
  });
});

/** The oauth-provider's consent endpoints over one in-memory list; the client named by
 * its public endpoint. Put before `apiKeyHandlers()`: the first match wins. */
function consentHandlers() {
  let consents = [
    { id: 'c1', clientId: 'claude-1', scopes: ['openid'], createdAt: '2026-09-03T00:00:00.000Z' },
  ];
  return [
    http.get(`${AUTH_URL}/oauth2/get-consents`, () => HttpResponse.json(consents)),
    http.get(`${AUTH_URL}/oauth2/public-client`, () =>
      HttpResponse.json({ client_name: 'Claude' }),
    ),
    http.post(`${AUTH_URL}/oauth2/delete-consent`, async ({ request }) => {
      const { id } = (await request.json()) as { id: string };
      consents = consents.filter((c) => c.id !== id);
      return HttpResponse.json(null);
    }),
  ];
}

describe('/profile: connected apps', () => {
  it('lists each app by its name, and revokes one', async () => {
    const user = userEvent.setup();
    const failed = vi.spyOn(toast, 'error');
    mswServer.use(...consentHandlers(), ...apiKeyHandlers());
    renderProfile();

    const row = (await screen.findByText('Claude')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent(/connected/);
    await user.click(within(row).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText(/No apps connected/)).toBeVisible();
    expect(failed).not.toHaveBeenCalled();
  });
});
