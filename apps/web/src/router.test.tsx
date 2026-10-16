import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from './router';
import { buildHandlers, fakeVacancy, statsHandler } from './test/msw/handlers';
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
// around it either way — so a test would stay green while asserting nothing about
// its route.
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
    expect(screen.getByRole('link', { name: /^inbox$/i })).toHaveAttribute('href', '/inbox');
  });

  it('shows the brand logo in the sidebar', async () => {
    renderIndex();
    const sidebar = (await screen.findByRole('link', { name: /^dashboard$/i })).closest('aside');
    expect(sidebar).not.toBeNull();
    expect(
      within(sidebar as HTMLElement).getByRole('img', { name: 'Job Search Copilot' }),
    ).toBeInTheDocument();
  });

  it('renders not found for an unknown path', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('renders the dashboard at the index route', async () => {
    renderIndex();
    expect(await screen.findByRole('heading', { name: /pipeline funnel/i })).toBeInTheDocument();
    expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
  });

  it.each([
    ['/vacancies?q=beta', 'vacancies', 'Acme'],
    // JSON-parsed by the router, so the number 2024: the old `q` schema had to coerce it.
    ['/applications?q=2024', 'applications', 'Beta Corp'],
  ])('ignores an old toolbar-search bookmark, %s', async (path, endpoint, company) => {
    // Search is a modal now, with no URL state: the page lists what it would without it.
    const asked: URLSearchParams[] = [];
    const onRequest = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith(`/${endpoint}`)) asked.push(url.searchParams);
    };
    mswServer.events.on('request:start', onRequest);
    try {
      mswServer.use(
        ...buildHandlers([
          fakeVacancy({ id: 1, company: 'Acme', status: 'NOT_REVIEWED' }),
          fakeVacancy({ id: 2, company: 'Beta Corp', status: 'APPLIED' }),
        ]),
        statsHandler(),
      );
      renderAt(path);

      // Neither row matches the old term, so a page still filtering on it lists nothing.
      expect(await screen.findByText(company)).toBeInTheDocument();
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/search company or role/i)).not.toBeInTheDocument();
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((query) => !query.has('search'))).toBe(true);
    } finally {
      mswServer.events.removeListener('request:start', onRequest);
    }
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
