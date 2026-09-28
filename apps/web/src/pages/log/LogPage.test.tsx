import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { fakeLogEntry, logHandler } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

function renderLog(path = '/log') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
  return router;
}

describe('LogPage', () => {
  it('renders each entry newest first, a missing company or title as a dash', async () => {
    mswServer.use(
      logHandler([
        fakeLogEntry({ id: 1, createdAt: '2026-09-01T00:00:00.000Z', company: 'Old Co' }),
        fakeLogEntry({
          id: 2,
          createdAt: '2026-09-02T00:00:00.000Z',
          url: 'https://beta.com/jobs/2',
          company: null,
          title: null,
        }),
      ]),
    );
    renderLog();

    expect(await screen.findByText('Old Co')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1); // below the header
    expect(rows[0]).toHaveTextContent('Sep 2, 26');
    expect(rows[0]).toHaveTextContent('—');
    expect(screen.getByRole('link', { name: 'https://beta.com/jobs/2' })).toHaveAttribute(
      'href',
      'https://beta.com/jobs/2',
    );
    expect(screen.getByText('Showing 2 of 2 entries')).toBeInTheDocument();
  });

  it('sends the search to the server and keeps it in the URL', async () => {
    const terms: (string | null)[] = [];
    mswServer.events.on('request:start', ({ request }) => {
      terms.push(new URL(request.url).searchParams.get('q'));
    });
    mswServer.use(
      logHandler([
        fakeLogEntry({ id: 1, company: 'Acme' }),
        fakeLogEntry({ id: 2, company: 'Beta', url: 'https://beta.com/jobs/2' }),
      ]),
    );
    const router = renderLog();
    await screen.findByText('Acme');

    await userEvent.setup().type(screen.getByPlaceholderText(/search/i), 'beta');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(terms).toContain('beta');
    expect(router.state.location.search).toEqual({ q: 'beta' });
    mswServer.events.removeAllListeners();
  });

  it('loads the next page when the table scrolls to the last loaded row', async () => {
    mswServer.use(
      logHandler(
        Array.from({ length: 130 }, (_, i) =>
          fakeLogEntry({ id: i + 1, url: `https://example.com/jobs/${i + 1}` }),
        ),
      ),
    );
    renderLog();
    expect(await screen.findByText('Showing 100 of 130 entries')).toBeInTheDocument();

    // jsdom lays nothing out: set the offset the virtualizer reads, then tell it.
    const scroller = screen.getByTestId('log-scroll');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 10_000_000 });
    fireEvent.scroll(scroller);

    expect(await screen.findByText('Showing 130 of 130 entries')).toBeInTheDocument();
  });
});
