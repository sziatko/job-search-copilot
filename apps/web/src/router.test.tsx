import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from './router';
import { buildApplicationHandlers, buildHandlers } from './test/msw/handlers';
import { mswServer } from './test/msw/server';

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
  );
}

// `/` renders the dashboard now, and the dashboard fires two queries. Every test
// that starts there registers handlers for both: with `onUnhandledRequest: 'error'`
// an unhandled request drops the page into its error branch, and the shell renders
// around it either way — which is exactly how this file used to stay green while
// asserting nothing about the route it was named after.
function renderIndex() {
  mswServer.use(...buildHandlers([]), ...buildApplicationHandlers([]));
  return renderAt('/');
}

describe('router', () => {
  it('renders the shell navigation at the index route', async () => {
    // These links live in the shell's Sidebar, so on their own they say nothing
    // about which page is mounted — every route renders them.
    renderIndex();
    expect(await screen.findByRole('link', { name: /analyzed vacancies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /application tracker/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^dashboard$/i })).toBeInTheDocument();
  });

  it('renders the dashboard at the index route', async () => {
    renderIndex();
    expect(await screen.findByRole('heading', { name: /pipeline funnel/i })).toBeInTheDocument();
    expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
  });

  it('reads a JSON-parsed number in ?q= as a term, not as an error', async () => {
    // The router parses query values before zod sees them, so `?q=2024` is the
    // number 2024. A strict `z.string()` threw out of validateSearch, and with no
    // `errorComponent` anywhere the whole page became "Something went wrong!" — for
    // a URL anyone can type.
    mswServer.use(...buildHandlers([]));
    renderAt('/vacancies?q=2024');

    expect(await screen.findByPlaceholderText(/search company or role/i)).toHaveValue('2024');
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('ignores a junk ?status= on /tracker instead of dropping the page', async () => {
    mswServer.use(...buildApplicationHandlers([]));
    renderAt('/tracker?status=BOGUS');

    // No coercion could make `BOGUS` a status, so it falls back to what an absent
    // value means: no filter.
    expect(await screen.findByLabelText('Status')).toHaveValue('ALL');
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('navigates from the index to /tracker', async () => {
    mswServer.use(...buildApplicationHandlers([]), ...buildHandlers([]));
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('link', { name: /application tracker/i }));
    expect(
      await screen.findByRole('heading', { name: /application tracker/i }),
    ).toBeInTheDocument();
  });
});
