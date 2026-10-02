import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from './router';
import { buildHandlers, statsHandler } from './test/msw/handlers';
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

// `/` renders the dashboard, and the dashboard fires two queries (`/stats` and
// `/vacancies`). Every test that starts there registers handlers for both: with `onUnhandledRequest: 'error'`
// an unhandled request drops the page into its error branch, and the shell renders
// around it either way — which is exactly how this file used to stay green while
// asserting nothing about the route it was named after.
function renderIndex() {
  mswServer.use(...buildHandlers([]), statsHandler());
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

  it('ignores a junk ?status= on /applications instead of dropping the page', async () => {
    mswServer.use(...buildHandlers([]), statsHandler());
    renderAt('/applications?status=BOGUS');

    // No coercion could make `BOGUS` a status, so it falls back to what an absent
    // value means: no filter.
    expect(await screen.findByLabelText('Status')).toHaveValue('ALL');
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('navigates from the index to /applications', async () => {
    mswServer.use(...buildHandlers([]), statsHandler());
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('link', { name: /application tracker/i }));
    expect(
      await screen.findByRole('heading', { name: /application tracker/i }),
    ).toBeInTheDocument();
  });

  it('renders the page title with no subtitle', async () => {
    mswServer.use(...buildHandlers([]));
    renderAt('/vacancies');
    const title = await screen.findByRole('heading', { level: 1, name: 'Analyzed vacancies' });
    const header = screen.getByRole('banner');
    expect(header).toContainElement(title);
    expect(header.querySelector('.topbar-sub')).toBeNull();
    expect(screen.queryByText(/review the analyzer's shortlist/i)).not.toBeInTheDocument();
  });

  it("compacts the header on any element's scroll, and restores it only at the top", async () => {
    mswServer.use(...buildHandlers([]));
    const { container } = renderAt('/vacancies');
    await screen.findByRole('heading', { level: 1, name: 'Analyzed vacancies' });
    const main = container.querySelector('.main') as HTMLElement;
    // Any scroll box, not only the window: scroll does not bubble, the shell
    // listens in the capture phase.
    const box = document.createElement('div');
    document.body.append(box);
    const scrollTo = (top: number) => {
      Object.defineProperty(box, 'scrollTop', { value: top, configurable: true });
      fireEvent.scroll(box);
    };

    scrollTo(30);
    expect(main).toHaveAttribute('data-compact');
    scrollTo(10); // inside the gap: stays compact
    expect(main).toHaveAttribute('data-compact');
    scrollTo(0);
    expect(main).not.toHaveAttribute('data-compact');
    box.remove();
  });
});
