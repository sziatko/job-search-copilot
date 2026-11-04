import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http, type RequestHandler } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TagRef } from '@/lib/tags/types';
import { API_URL, buildHandlers, holdGet } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import { AddTagModal } from './AddTagModal';

const REMOTE: TagRef = { id: 1, name: 'Remote', tone: 'GOOD' };
const RELOCATION: TagRef = { id: 2, name: 'Relocation', tone: 'WARN' };
const LINKEDIN: TagRef = { id: 3, name: 'LinkedIn', tone: 'NEUTRAL' };

/** `first` go in front of the fake's own handlers — a `holdGet` must. */
function renderModal(tags: TagRef[], assigned: TagRef[] = [], ...first: RequestHandler[]) {
  mswServer.use(...first, ...buildHandlers([], tags));
  const onAdd = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AddTagModal assigned={assigned} onAdd={onAdd} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onAdd, onClose, user: userEvent.setup() };
}

const nameField = () => screen.getByRole('textbox', { name: 'Tag name' });
const offered = () =>
  within(screen.getByRole('list', { name: 'Matching tags' }))
    .getAllByRole('button')
    .map((button) => button.textContent);

/** The bodies of the POST /tags requests sent. */
function recordCreates() {
  const bodies: unknown[] = [];
  mswServer.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/tags')) {
      bodies.push(await request.clone().json());
    }
  });
  return bodies;
}

afterEach(() => mswServer.events.removeAllListeners());

describe('AddTagModal', () => {
  it('focuses the name field on open', async () => {
    renderModal([REMOTE]);
    await screen.findByRole('list', { name: 'Matching tags' });
    expect(nameField()).toHaveFocus();
  });

  it("offers the user's tags but those the vacancy has, and picks one", async () => {
    const { user, onAdd, onClose } = renderModal([REMOTE, RELOCATION, LINKEDIN], [LINKEDIN]);

    await user.click(await screen.findByRole('button', { name: 'Remote' }));

    expect(offered()).toEqual(['Relocation', 'Remote']);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining(REMOTE));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('searches on the client, in any spelling, with no request per letter', async () => {
    const { user } = renderModal([REMOTE, RELOCATION]);
    await screen.findByRole('list', { name: 'Matching tags' });
    const gets: string[] = [];
    mswServer.events.on('request:start', ({ request }) => {
      gets.push(request.url);
    });

    await user.type(nameField(), '  REM');

    expect(offered()).toEqual(['Remote']);
    expect(gets).toEqual([]);
  });

  it('Enter on a name it knows picks that tag, whatever its spelling, and creates nothing', async () => {
    const creates = recordCreates();
    const { user, onAdd } = renderModal([REMOTE]);
    await screen.findByRole('list', { name: 'Matching tags' });

    await user.type(nameField(), ' remote {Enter}');

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining(REMOTE));
    expect(creates).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();
  });

  it('creates a new name with the tone picked, then hands the new tag over', async () => {
    const creates = recordCreates();
    const { user, onAdd, onClose } = renderModal([REMOTE]);
    await screen.findByRole('list', { name: 'Matching tags' });

    await user.type(nameField(), 'Contract');
    await user.click(screen.getByRole('radio', { name: 'Bad' }));
    await user.click(screen.getByRole('button', { name: 'Create “Contract”' }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Contract', tone: 'BAD' }),
      ),
    );
    expect(creates).toEqual([{ name: 'Contract', tone: 'BAD' }]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a new tag is Neutral unless told otherwise', async () => {
    const creates = recordCreates();
    const { user, onAdd } = renderModal([]);
    await screen.findByText(/no tags to add yet/i);

    await user.type(nameField(), 'Contract{Enter}');

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(creates).toEqual([{ name: 'Contract', tone: 'NEUTRAL' }]);
  });

  it('holds the buttons while the new tag is created', async () => {
    const { user, onAdd } = renderModal([REMOTE]);
    await screen.findByRole('list', { name: 'Matching tags' });
    mswServer.use(
      http.post(`${API_URL}/tags`, async () => {
        await delay(300);
        return HttpResponse.json({ id: 9, name: 'Re', tone: 'NEUTRAL' }, { status: 201 });
      }),
    );

    await user.type(nameField(), 'Re');
    await user.click(screen.getByRole('button', { name: 'Create “Re”' }));

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remote' })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
  });

  it('stays open and quotes the server on a refused name; typing clears it', async () => {
    const { user, onAdd, onClose } = renderModal([REMOTE]);
    await screen.findByRole('list', { name: 'Matching tags' });
    mswServer.use(
      http.post(`${API_URL}/tags`, () =>
        HttpResponse.json({ message: 'That name is taken' }, { status: 409 }),
      ),
    );

    await user.type(nameField(), 'Contract');
    await user.click(screen.getByRole('button', { name: 'Create “Contract”' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That name is taken');
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.type(nameField(), 's');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the list loading, and offers no new name until it has answered', async () => {
    const held = holdGet('/tags');
    const { user } = renderModal([REMOTE], [], held.handler);

    await user.type(nameField(), 'Remote');

    expect(screen.getByText('Loading tags…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();
    held.release();
    expect(await screen.findByRole('button', { name: 'Remote' })).toBeInTheDocument();
  });

  it('reports a failed list, and offers no new name', async () => {
    const { user } = renderModal(
      [REMOTE],
      [],
      http.get(`${API_URL}/tags`, () => HttpResponse.json(null, { status: 500 })),
    );

    await user.type(nameField(), 'Contract');

    expect(await screen.findByText(/Failed to load tags/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();
  });

  it('says so with no tags to offer, and with a name the vacancy already has', async () => {
    const { user } = renderModal([REMOTE], [REMOTE]);
    await screen.findByText(/no tags to add yet/i);

    await user.type(nameField(), 'remote');

    expect(screen.getByText('“Remote” is already on this vacancy.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();
  });

  it('Cancel and Escape close it without adding', async () => {
    const { user, onAdd, onClose } = renderModal([REMOTE]);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
