import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys, staleAfter } from '@/lib/queryKeys';
import type { TagRef } from '@/lib/tags/types';
import { routeTree } from '@/router';
import { API_URL, buildHandlers, fakeVacancy, holdGet } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

const REMOTE: TagRef = { id: 1, name: 'Remote', tone: 'GOOD' };
const RELOCATION: TagRef = { id: 2, name: 'Relocation', tone: 'WARN' };
const UNUSED: TagRef = { id: 3, name: 'Unused', tone: 'NEUTRAL' };

function renderProfile() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/profile'] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
  return { client, user: userEvent.setup() };
}

/** Remote on two vacancies, Relocation on one, Unused on none. */
function serveTags() {
  mswServer.use(
    ...buildHandlers(
      [fakeVacancy({ id: 1, tags: [RELOCATION, REMOTE] }), fakeVacancy({ id: 2, tags: [REMOTE] })],
      [UNUSED],
    ),
  );
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement;
const openEdit = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(await screen.findByRole('button', { name: `Edit tag ${name}` }));
  return screen.findByRole('dialog', { name: 'Edit the tag' });
};
const openDelete = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(await screen.findByRole('button', { name: `Delete tag ${name}` }));
  return screen.findByRole('dialog', { name: `Delete “${name}”?` });
};

afterEach(() => vi.restoreAllMocks());

describe('/profile', () => {
  it('holds no access card: they are on /settings', async () => {
    mswServer.use(...buildHandlers([]));
    renderProfile();

    expect(await screen.findByRole('heading', { name: /coming soon/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Tags' })).toBeVisible();
    for (const name of ['Passkeys', 'API keys', 'Connected apps']) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
  });
});

describe('/profile: the tags list', () => {
  it('lists each tag with how many vacancies carry it', async () => {
    serveTags();
    renderProfile();

    expect(await rowOf('Remote')).toHaveTextContent('2 vacancies');
    expect(await rowOf('Relocation')).toHaveTextContent('1 vacancy');
    expect(await rowOf('Unused')).toHaveTextContent('0 vacancies');
  });

  it('says so while loading, then with no tags', async () => {
    const held = holdGet('/tags');
    mswServer.use(held.handler, ...buildHandlers([]));
    renderProfile();

    expect(await screen.findByText('Loading…')).toBeVisible();
    held.release();
    expect(await screen.findByText(/No tags yet/)).toBeVisible();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('says so when the list fails to load', async () => {
    mswServer.use(http.get(`${API_URL}/tags`, () => new HttpResponse(null, { status: 500 })));
    renderProfile();

    expect(await screen.findByText('Failed to load tags: HTTP 500')).toBeVisible();
  });
});

describe('/profile: editing a tag', () => {
  it('renames a tag, and focus returns to its row', async () => {
    serveTags();
    const { user } = renderProfile();

    const dialog = await openEdit(user, 'Remote');
    const name = within(dialog).getByRole('textbox', { name: 'Tag name' });
    expect(name).toHaveFocus();
    expect(name).toHaveValue('Remote');
    await user.clear(name);
    await user.type(name, 'Fully remote');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await rowOf('Fully remote')).toHaveTextContent('2 vacancies');
    expect(screen.queryByText('Remote')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit tag Fully remote' })).toHaveFocus();
  });

  it('picks a tone, and the dialog opens with it next time', async () => {
    serveTags();
    const { user } = renderProfile();

    const dialog = await openEdit(user, 'Unused');
    expect(within(dialog).getByRole('radio', { name: 'Neutral' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'Accent' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const again = await openEdit(user, 'Unused');
    expect(within(again).getByRole('radio', { name: 'Accent' })).toBeChecked();
    expect(within(again).getByRole('textbox', { name: 'Tag name' })).toHaveValue('Unused');
  });

  it('a taken name is the server’s message, in the dialog, until the name changes', async () => {
    serveTags();
    const { user } = renderProfile();

    const dialog = await openEdit(user, 'Unused');
    const name = within(dialog).getByRole('textbox', { name: 'Tag name' });
    await user.clear(name);
    await user.type(name, ' REMOTE ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Tag " REMOTE " already exists',
    );
    expect(await rowOf('Unused')).toBeInTheDocument();

    await user.type(name, 'x');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a spelling change of its own name: not a conflict', async () => {
    serveTags();
    const { user } = renderProfile();

    const dialog = await openEdit(user, 'Remote');
    const name = within(dialog).getByRole('textbox', { name: 'Tag name' });
    await user.clear(name);
    await user.type(name, 'REMOTE');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await rowOf('REMOTE')).toHaveTextContent('2 vacancies');
  });

  it('cannot save a blank name', async () => {
    serveTags();
    const { user } = renderProfile();

    const dialog = await openEdit(user, 'Remote');
    const name = within(dialog).getByRole('textbox', { name: 'Tag name' });
    await user.clear(name);
    await user.type(name, '   ');

    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('/profile: deleting a tag', () => {
  it('asks first, naming the vacancy count; Cancel keeps the tag', async () => {
    serveTags();
    const { user } = renderProfile();

    const dialog = await openDelete(user, 'Remote');
    expect(dialog).toHaveTextContent('This takes the tag off 2 vacancies.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await rowOf('Remote')).toHaveTextContent('2 vacancies');
  });

  it('deletes on confirmation', async () => {
    serveTags();
    const { user } = renderProfile();

    const dialog = await openDelete(user, 'Remote');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Remote')).not.toBeInTheDocument());
    expect(await rowOf('Relocation')).toBeInTheDocument();
  });

  it('a failed delete says why and keeps the tag', async () => {
    const failed = vi.spyOn(toast, 'error');
    serveTags();
    mswServer.use(
      http.delete(`${API_URL}/tags/:id`, () =>
        HttpResponse.json({ message: 'Tag 1 not found' }, { status: 404 }),
      ),
    );
    const { user } = renderProfile();

    const dialog = await openDelete(user, 'Remote');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(failed).toHaveBeenCalledWith('Tag 1 not found'));
    expect(await rowOf('Remote')).toBeInTheDocument();
  });
});

describe('/profile: the lists showing chips', () => {
  /** A cached entry for every key a tag's edit makes stale, none of them on screen. */
  function seedLists(client: QueryClient) {
    const keys = staleAfter.tagWrite.filter((key) => key[0] !== queryKeys.tags()[0]);
    for (const key of keys) client.setQueryData(key, { seeded: true });
    return () => keys.map((key) => client.getQueryState(key)?.isInvalidated);
  }

  it('go stale after a rename', async () => {
    serveTags();
    const { client, user } = renderProfile();
    const invalidated = seedLists(client);

    const dialog = await openEdit(user, 'Remote');
    const name = within(dialog).getByRole('textbox', { name: 'Tag name' });
    await user.type(name, ' only');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await screen.findByText('Remote only');
    expect(invalidated().every(Boolean)).toBe(true);
  });

  it('go stale after a delete', async () => {
    serveTags();
    const { client, user } = renderProfile();
    const invalidated = seedLists(client);

    const dialog = await openDelete(user, 'Remote');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Remote')).not.toBeInTheDocument());
    expect(invalidated().every(Boolean)).toBe(true);
  });
});
