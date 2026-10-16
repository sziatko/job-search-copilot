import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Stats } from '@/pages/dashboard/types';
import { routeTree } from '@/router';
import {
  buildHandlers,
  type FakeVacancy,
  fakeStats,
  fakeVacancy,
  holdGet,
  statsHandler,
} from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import { companyOrder } from '@/test/rows';
import { expectLoadedTable, expectSkeletonTable } from '@/test/skeleton';
import type { ApplicationPage } from './api';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

/** A vacancy in the pipeline — the rows /applications lists. */
function application(overrides: Partial<FakeVacancy> = {}): FakeVacancy {
  // Dates are relative to now, not fixed: the KPI row's Active/Timeout tiles are
  // derived from them, so a literal date would make these tests rot on the calendar.
  const applied = daysAgo(10);
  return fakeVacancy({
    status: 'APPLIED',
    // Applying is the last move until the status changes again.
    appliedAt: applied,
    statusChangedAt: applied,
    ...overrides,
  });
}

/** The fake table plus `/stats` — the strip reads the server's counts, not the rows. */
function serve(rows: FakeVacancy[], stats: Stats = fakeStats()) {
  mswServer.use(...buildHandlers(rows), statsHandler(stats));
}

/** `GET /applications` answering one fixed page, for the tests that shadow the fake. */
function onePage(...items: (FakeVacancy & { timedOut?: boolean })[]) {
  return http.get('http://localhost:3000/api/v1/applications', () =>
    HttpResponse.json({
      items: items.map((item) => ({ timedOut: false, ...item })),
      total: items.length,
      nextCursor: null,
    }),
  );
}

/** Every cached row under the list prefix — the pages of every key. */
function cachedRows(client: QueryClient) {
  return client
    .getQueriesData<InfiniteData<ApplicationPage>>({ queryKey: ['applications'] })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? []);
}

function renderApplications(path = '/applications') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // The client comes back too: one test asserts what the optimistic write put in
  // the cache, which is not observable through the DOM alone.
  return {
    client,
    ...render(
      createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
    ),
  };
}

/** The toolbar's Status filter — each row's pipeline select is "Status of <role> at
 * <company>". */
const statusFilter = () => screen.getByLabelText('Status');
/** The one row's pipeline select. */
const rowSelect = () =>
  within(screen.getByRole('table')).getByRole('combobox', { name: /^Status/ });

afterEach(() => vi.restoreAllMocks());

describe('ApplicationsPage / useApplications', () => {
  it('lists applications', async () => {
    serve([
      application({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
      application({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
    ]);
    renderApplications();
    await screen.findByText('Acme');
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('draws skeleton rows under its header while the first page loads', async () => {
    serve([application({ id: 1, company: 'Acme', title: 'Backend Engineer' })]);
    const hold = holdGet('/applications');
    mswServer.use(hold.handler);
    renderApplications();

    const table = await expectSkeletonTable('Role');
    // The skeleton stands in for the empty state too, until there is data to judge.
    expect(screen.queryByText('No applications recorded yet.')).not.toBeInTheDocument();
    hold.release();
    await expectLoadedTable(table, 'Backend Engineer');
  });

  it("opens the company's history from the duplicates button", async () => {
    serve([
      application({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
      // Never applied to: off this table, still one of Acme's vacancies.
      fakeVacancy({ id: 2, company: 'Acme', title: 'Data Engineer', status: 'DECLINED' }),
      application({ id: 3, company: 'Beta Corp', title: 'Frontend Lead' }),
    ]);
    renderApplications();
    await screen.findByText('Backend Engineer');
    expect(screen.queryByText('Data Engineer')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /other vacancies? at Beta Corp/i }),
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '1 other vacancy at Acme' }));

    const modal = within(await screen.findByRole('dialog'));
    expect(modal.getByText('All vacancies at Acme')).toBeInTheDocument();
    expect(await modal.findByText('Data Engineer')).toBeInTheDocument();
    expect(modal.getByText('Backend Engineer')).toBeInTheDocument();
    expect(modal.getByText('Current')).toBeInTheDocument();
  });

  it('orders rows by the last status move, newest first — not by the applied date', async () => {
    serve([
      application({ id: 1, company: 'Older Co', statusChangedAt: daysAgo(40) }),
      // Applied long ago, but moved yesterday: the move is what counts.
      application({
        id: 2,
        company: 'Newest Co',
        appliedAt: daysAgo(90),
        statusChangedAt: daysAgo(1),
        status: 'INTERVIEW',
      }),
      application({ id: 3, company: 'Middle Co', statusChangedAt: daysAgo(20) }),
    ]);
    renderApplications();
    await screen.findByText('Newest Co');
    expect(companyOrder()).toEqual(['Newest Co', 'Middle Co', 'Older Co']);
  });

  it('moves a row to the top as soon as its status changes', async () => {
    serve([
      application({ id: 1, company: 'Older Co', statusChangedAt: daysAgo(40) }),
      application({ id: 2, company: 'Newer Co', statusChangedAt: daysAgo(1) }),
    ]);
    renderApplications();
    await screen.findByText('Older Co');
    expect(companyOrder()).toEqual(['Newer Co', 'Older Co']);

    const user = userEvent.setup();
    const olderRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('Older Co'));
    await user.selectOptions(
      within(olderRow as HTMLElement).getByRole('combobox', { name: /^Status/ }),
      'ACTION_NEEDED',
    );

    await waitFor(() => expect(companyOrder()).toEqual(['Older Co', 'Newer Co']));
  });

  it('filters by status', async () => {
    serve([
      application({ id: 1, company: 'Acme', status: 'APPLIED' }),
      application({ id: 2, company: 'Beta Corp', status: 'REJECTED' }),
    ]);
    renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(statusFilter(), 'REJECTED');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('lists the pipeline only under All: its endpoint is the context, so no status goes', async () => {
    const lists: URL[] = [];
    mswServer.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/applications')) lists.push(url);
    });
    serve([application({ id: 1, company: 'Acme' }), fakeVacancy({ id: 2, company: 'Triage Co' })]);
    renderApplications();

    await screen.findByText('Acme');
    expect(statusFilter()).toHaveValue('ALL');
    expect(screen.queryByText('Triage Co')).not.toBeInTheDocument();
    expect(lists.at(-1)?.searchParams.has('status')).toBe(false);
    mswServer.events.removeAllListeners();
  });

  /** `stats.pipeline` with these counts; the rest zero. */
  const pipeline = (counts: Partial<Stats['pipeline']['byStatus']>, active = 0, timedOut = 0) => {
    const byStatus = { ...fakeStats().pipeline.byStatus, ...counts };
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return fakeStats({ pipeline: { byStatus, active, timedOut, total } });
  };

  it('reads the KPI strip from /stats, not from the loaded rows', async () => {
    // One row loaded; the server counts a pipeline of seven.
    serve([application({ id: 1 })], pipeline({ APPLIED: 3, REJECTED: 2, OFFER: 2 }, 1, 2));
    renderApplications();
    // Each tile is a button labelled "<label>: <value>".
    expect(await screen.findByRole('button', { name: 'Total: 7' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeout: 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offer: 2' })).toBeInTheDocument(); // non-zero, so shown
    // Zero, not shown.
    expect(screen.queryByRole('button', { name: /^Interview: / })).not.toBeInTheDocument();
    // Total + Active + Timeout (always) + Applied + Rejected (always) + Offer = 6 tiles.
    expect(screen.getAllByTestId('kpi-tile')).toHaveLength(6);
  });

  it('filters from a KPI tile through the server, and keeps the dropdown in sync', async () => {
    const requests: string[] = [];
    mswServer.events.on('request:start', ({ request }) => {
      if (request.url.includes('/applications')) requests.push(request.url);
    });
    serve(
      [
        application({ id: 1, company: 'Fresh Co', statusChangedAt: daysAgo(5) }),
        application({ id: 2, company: 'Stale Co', statusChangedAt: daysAgo(60) }),
      ],
      pipeline({ APPLIED: 2 }, 1, 1),
    );
    renderApplications();
    await screen.findByText('Fresh Co');
    // The ⏳ is the server's `timedOut`, not a date sum in the browser.
    const rowText = (company: string) =>
      screen.getAllByRole('row').find((r) => r.textContent?.includes(company))?.textContent;
    expect(rowText('Stale Co')).toContain('⏳');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Timeout: 1' }));

    await waitFor(() => expect(screen.queryByText('Fresh Co')).not.toBeInTheDocument());
    expect(screen.getByText('Stale Co')).toBeInTheDocument();
    expect(statusFilter()).toHaveValue('TIMEOUT');
    expect(requests.at(-1)).toMatch(/[?&]state=timedOut/);
    expect(requests.at(-1)).not.toMatch(/[?&]status=/);

    await user.click(screen.getByRole('button', { name: 'Active: 1' }));
    await waitFor(() => expect(requests.at(-1)).toMatch(/[?&]state=active/));
    mswServer.events.removeAllListeners();
  });

  it('shows an Awaiting tile that filters by AWAITING, as the dropdown does', async () => {
    serve(
      [
        application({ id: 1, company: 'Waiting Co', status: 'AWAITING' }),
        application({ id: 2, company: 'Fresh Co' }),
      ],
      pipeline({ AWAITING: 1, APPLIED: 1 }, 2),
    );
    renderApplications();
    await screen.findByText('Waiting Co');
    expect(within(statusFilter()).getByRole('option', { name: 'Awaiting' })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Awaiting: 1' }));

    await waitFor(() => expect(screen.queryByText('Fresh Co')).not.toBeInTheDocument());
    expect(screen.getByText('Waiting Co')).toBeInTheDocument();
    expect(statusFilter()).toHaveValue('AWAITING');
  });

  it('loads the next page when the table scrolls to the last loaded row', async () => {
    serve(
      Array.from({ length: 130 }, (_, i) =>
        application({ id: i + 1, company: `Co ${i + 1}`, statusChangedAt: daysAgo(i / 100) }),
      ),
    );
    renderApplications();
    await screen.findByText('Showing 100 of 130');

    // jsdom lays nothing out: set the offset the virtualizer reads, then tell it.
    const scroller = screen.getByRole('region', { name: 'Applications' });
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 10_000_000 });
    fireEvent.scroll(scroller);

    expect(await screen.findByText('Showing 130 of 130')).toBeInTheDocument();
  });

  it('optimistically changes a status and keeps it on success, and says so', async () => {
    const success = vi.spyOn(toast, 'success');
    serve([application({ id: 1, status: 'APPLIED' })]);
    renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(rowSelect(), 'INTERVIEW');

    await waitFor(() => expect(rowSelect()).toHaveValue('INTERVIEW'));
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith('Moved to Interview', {
        description: expect.stringMatching(/ — Acme$/),
      }),
    );
  });

  it('rolls the status back and shows a row error when the save fails', async () => {
    const success = vi.spyOn(toast, 'success');
    mswServer.use(
      statsHandler(),
      onePage(application({ id: 1, status: 'APPLIED' })),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', () =>
        HttpResponse.json(null, { status: 500 }),
      ),
    );
    renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(rowSelect(), 'INTERVIEW');

    await screen.findByText(/failed to save|HTTP 500/i);
    expect(rowSelect()).toHaveValue('APPLIED');
    expect(success).not.toHaveBeenCalledWith('Moved to Interview', expect.anything());
  });

  it('shows a friendly error when the list response has the wrong shape', async () => {
    mswServer.use(
      statsHandler(),
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({ items: 'not-an-array' }),
      ),
    );
    renderApplications();
    expect(await screen.findByText(/unexpected format/i)).toBeInTheDocument();
  });

  it('renders an applyUrl that fails the scheme gate as text, not a link', async () => {
    // `applyUrl` is scraped, so it is untrusted input that reaches an href. The table
    // runs every value through the scheme gate: a real link stays a link, everything
    // else becomes plain text.
    serve([
      application({ id: 1, title: 'Ordinary Role', applyUrl: 'https://acme.com/jobs/1' }),
      application({
        id: 2,
        title: 'Synthetic Role',
        applyUrl: 'tracker://acme/synthetic-role/2026-09-01',
      }),
      application({ id: 3, title: 'Hostile Role', applyUrl: 'javascript:alert(1)' }),
    ]);
    renderApplications();
    await screen.findByText('Ordinary Role');

    expect(screen.getByRole('link', { name: 'Ordinary Role' })).toHaveAttribute(
      'href',
      'https://acme.com/jobs/1',
    );
    // Not links — but the posting is still named on the row rather than hidden.
    expect(screen.queryByRole('link', { name: 'Synthetic Role' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Hostile Role' })).toBeNull();
    expect(screen.getByText('Synthetic Role')).toBeInTheDocument();
    expect(screen.getByText('Hostile Role')).toBeInTheDocument();
  });

  it('shows the last-move stamp on a row only once it has actually moved', async () => {
    serve([
      // Freshly recorded: applying is the last move, so a second date line would
      // just repeat the one above it.
      application({ id: 1, title: 'Untouched Role' }),
      application({ id: 2, title: 'Moved Role', statusChangedAt: daysAgo(2) }),
    ]);
    renderApplications();
    await screen.findByText('Untouched Role');

    const rowText = (title: string) =>
      screen.getAllByRole('row').find((r) => r.textContent?.includes(title))?.textContent ?? '';
    expect(rowText('Untouched Role')).not.toMatch(/upd:/);
    expect(rowText('Moved Role')).toMatch(/upd:/);
  });

  it('marks a row that has gone quiet for more than thirty days', async () => {
    serve([
      application({ id: 1, title: 'Stale Role', statusChangedAt: daysAgo(45) }),
      application({ id: 2, title: 'Live Role', statusChangedAt: daysAgo(1) }),
    ]);
    renderApplications();
    await screen.findByText('Stale Role');

    const rowText = (title: string) =>
      screen.getAllByRole('row').find((r) => r.textContent?.includes(title))?.textContent ?? '';
    expect(rowText('Stale Role')).toContain('⏳');
    expect(rowText('Live Role')).not.toContain('⏳');

    // The explanation is a hover bubble like everywhere else, not a native `title`.
    const staleRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('Stale Role'));
    expect(
      within(staleRow as HTMLElement).getByText('45 days since last update'),
    ).toBeInTheDocument();
  });

  it('writes the new last-move stamp into the cache optimistically', async () => {
    // writeStatus() restamps statusChangedAt server-side, which restarts the timeout
    // clock. Without the mirror in useApplications, a changed row would keep its old
    // place and its ⏳ until the refetch landed. The PATCH is delayed so the refetch
    // cannot be the one that moved it — otherwise the assertion would pass with the
    // mirror deleted.
    mswServer.use(
      statsHandler(),
      onePage({
        ...application({ id: 1, status: 'APPLIED', statusChangedAt: daysAgo(45) }),
        timedOut: true,
      }),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', async ({ params }) => {
        await delay(500);
        return HttpResponse.json({
          ...application({
            id: Number(params.id),
            status: 'INTERVIEW',
            statusChangedAt: daysAgo(0),
          }),
          timedOut: false,
        });
      }),
    );
    const { client } = renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(rowSelect(), 'INTERVIEW');
    // Let onMutate's `await cancelQueries` settle — and nothing else, since the
    // response is still half a second away.
    await act(async () => {});

    const row = cachedRows(client).find((i) => i.id === 1);
    expect(row?.status).toBe('INTERVIEW');
    expect(row?.statusChangedAt).not.toBe(row?.appliedAt);
    expect(row?.timedOut).toBe(false);
  });

  it('writes a new applied date when a row is moved back to APPLIED', async () => {
    // The server journals a new APPLIED row, and appliedAt is the latest one — so
    // the cache must not keep the old date (and an "upd:" line) until the refetch.
    mswServer.use(
      statsHandler(),
      onePage(application({ id: 1, status: 'REJECTED', statusChangedAt: daysAgo(3) })),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', async ({ params }) => {
        await delay(500);
        return HttpResponse.json({ ...application({ id: Number(params.id) }), timedOut: false });
      }),
    );
    const { client } = renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(rowSelect(), 'APPLIED');
    await act(async () => {});

    const row = cachedRows(client).find((i) => i.id === 1);
    expect(row?.status).toBe('APPLIED');
    expect(row?.appliedAt).toBe(row?.statusChangedAt);
  });

  it('refetches the stats and marks the /vacancies lists stale after a status move', async () => {
    let statsRequests = 0;
    mswServer.use(
      ...buildHandlers([application({ id: 1, status: 'APPLIED' })]),
      http.get('http://localhost:3000/api/v1/stats', () => {
        statsRequests += 1;
        return HttpResponse.json(fakeStats());
      }),
    );
    const { client } = renderApplications();
    await screen.findByText('Acme');
    await waitFor(() => expect(statsRequests).toBe(1));
    // /vacancies tags the same rows with their pipeline status.
    client.setQueryData(['vacancies', ''], { items: [], total: 0 });

    const user = userEvent.setup();
    await user.selectOptions(rowSelect(), 'INTERVIEW');

    await waitFor(() => expect(statsRequests).toBe(2));
    expect(client.getQueryState(['vacancies', ''])?.isInvalidated).toBe(true);
  });

  describe('the Action column', () => {
    it('has only Copy and Edit', async () => {
      serve([application({ id: 1 })]);
      renderApplications();
      await screen.findByText('Acme');

      const row = within(screen.getByRole('table')).getAllByRole('row')[1];
      expect(
        within(row)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Copy', 'Edit']);
    });

    it('re-opens the apply dialog pre-filled, with an empty comment that is added to the row', async () => {
      const success = vi.spyOn(toast, 'success');
      serve([
        application({
          id: 1,
          salaryInApplication: '100 PLN/h',
          comments: [
            { id: 7, createdAt: '2026-09-01T10:00:00Z', body: 'First note', source: 'USER' },
          ],
        }),
      ]);
      renderApplications();
      await screen.findByText('Acme');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /edit backend engineer at acme/i }));
      const dialog = screen.getByRole('dialog', { name: /edit application/i });
      const salary = within(dialog).getByLabelText(/salary/i);
      expect(salary).toHaveValue('100 PLN/h');
      // Comments are append-only: the field is a new one, never the old one to edit.
      const comment = within(dialog).getByLabelText('Add a comment');
      expect(comment).toHaveValue('');

      await user.clear(salary);
      await user.type(salary, '120 PLN/h');
      await user.type(comment, 'Went well.');
      await user.click(within(dialog).getByRole('button', { name: 'OK' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const table = screen.getByRole('table');
      expect(await within(table).findByText('120 PLN/h')).toBeInTheDocument();
      expect(
        [...table.querySelectorAll('[data-source="USER"]')].map((el) => el.lastChild?.textContent),
      ).toEqual(['First note', 'Went well.']);
      await waitFor(() =>
        expect(success).toHaveBeenCalledWith('Application updated', {
          description: 'Backend Engineer — Acme',
        }),
      );
    });

    it('rolls a failed edit back, comment included, and shows the row error', async () => {
      serve([application({ id: 1 })]);
      // A later use() is prepended, so this refusal shadows the fake's own handler.
      mswServer.use(
        http.patch('http://localhost:3000/api/v1/applications/:id', () =>
          HttpResponse.json({ message: 'Application 1 not found' }, { status: 404 }),
        ),
      );
      renderApplications();
      await screen.findByText('Acme');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /edit backend engineer at acme/i }));
      const dialog = screen.getByRole('dialog', { name: /edit application/i });
      await user.type(within(dialog).getByLabelText('Add a comment'), 'Lost note{Enter}');

      expect(await screen.findByText('Application 1 not found')).toBeInTheDocument();
      expect(screen.queryByText('Lost note', { exact: false })).not.toBeInTheDocument();
    });
  });
});
