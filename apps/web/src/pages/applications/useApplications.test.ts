import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { buildHandlers, type FakeVacancy, fakeVacancy } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
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

describe('ApplicationsPage / useApplications', () => {
  it('lists applications and filters the search by company OR role', async () => {
    mswServer.use(
      ...buildHandlers([
        application({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
        application({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
      ]),
    );
    renderApplications();
    await screen.findByText('Acme');
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search company or role/i), 'lead');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  /** The companies down the table, top to bottom. Read out of each row's meta cell
   * rather than off a text node: the cell also carries the id, and matching text
   * nodes couples the test to how JSX happens to lay the whitespace out. */
  const companyOrder = () =>
    screen
      .getAllByRole('row')
      .map((row) => row.querySelector('.role-meta')?.textContent)
      .filter((cell): cell is string => Boolean(cell))
      .map((cell) => cell.replace(/\s*#\d+$/, ''));

  it('orders rows by the last status move, newest first — not by the applied date', async () => {
    mswServer.use(
      ...buildHandlers([
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
      ]),
    );
    renderApplications();
    await screen.findByText('Newest Co');
    expect(companyOrder()).toEqual(['Newest Co', 'Middle Co', 'Older Co']);
  });

  it('moves a row to the top as soon as its status changes', async () => {
    mswServer.use(
      ...buildHandlers([
        application({ id: 1, company: 'Older Co', statusChangedAt: daysAgo(40) }),
        application({ id: 2, company: 'Newer Co', statusChangedAt: daysAgo(1) }),
      ]),
    );
    renderApplications();
    await screen.findByText('Older Co');
    expect(companyOrder()).toEqual(['Newer Co', 'Older Co']);

    const user = userEvent.setup();
    const olderRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('Older Co'));
    await user.selectOptions(within(olderRow as HTMLElement).getByRole('combobox'), 'REPLIED');

    await waitFor(() => expect(companyOrder()).toEqual(['Older Co', 'Newer Co']));
  });

  it('filters by status', async () => {
    mswServer.use(
      ...buildHandlers([
        application({ id: 1, company: 'Acme', status: 'APPLIED' }),
        application({ id: 2, company: 'Beta Corp', status: 'REJECTED' }),
      ]),
    );
    renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'REJECTED');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('shows a KPI row counting the whole (unfiltered) log', async () => {
    mswServer.use(
      ...buildHandlers([
        application({ id: 1, status: 'APPLIED' }),
        application({ id: 2, status: 'REJECTED' }),
        application({ id: 3, status: 'REJECTED' }),
        application({ id: 4, status: 'OFFER' }),
      ]),
    );
    renderApplications();
    const totalLabel = await screen.findByText('Total');
    const row = totalLabel.closest('.kpi-row') as HTMLElement;
    const s = within(row);
    expect(s.getByText('Offer')).toBeInTheDocument(); // non-zero, so shown
    expect(s.queryByText('Interview')).not.toBeInTheDocument(); // zero, not shown
    // Total + Active + Timeout (always) + Applied + Rejected (always) + Offer = 6 tiles.
    expect(row.querySelectorAll('.kpi-value')).toHaveLength(6);
  });

  it('counts Active and Timeout, and the two close over the whole log', async () => {
    mswServer.use(
      ...buildHandlers([
        application({ id: 1, status: 'APPLIED' }),
        application({
          id: 2,
          status: 'INTERVIEW',
          appliedAt: daysAgo(90),
          statusChangedAt: daysAgo(2), // moved recently — old application is not stale
        }),
        application({
          id: 3,
          status: 'REPLIED',
          appliedAt: daysAgo(45),
          statusChangedAt: daysAgo(45),
        }),
        application({
          id: 4,
          status: 'REJECTED',
          appliedAt: daysAgo(90),
          statusChangedAt: daysAgo(90),
        }),
        application({
          id: 5,
          status: 'OFFER',
          appliedAt: daysAgo(90),
          statusChangedAt: daysAgo(90),
        }),
      ]),
    );
    renderApplications();
    const totalLabel = await screen.findByText('Total');
    const row = totalLabel.closest('.kpi-row') as HTMLElement;
    const s = within(row);

    // Each tile is a button labelled "<label>: <value>".
    expect(s.getByRole('button', { name: 'Total: 5' })).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'Active: 2' })).toBeInTheDocument(); // 1 APPLIED + 2 INTERVIEW
    // Any non-closed status ages out, not just APPLIED.
    expect(s.getByRole('button', { name: 'Timeout: 1' })).toBeInTheDocument(); // 3 REPLIED
    // Closed outcomes are never "stuck" — 4 and 5 are 90 days old and still not counted.
    expect(s.getByRole('button', { name: 'Rejected: 1' })).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'Offer: 1' })).toBeInTheDocument();
  });

  it('filters from a KPI tile and keeps the dropdown in sync', async () => {
    mswServer.use(
      ...buildHandlers([
        application({
          id: 1,
          company: 'Fresh Co',
          appliedAt: daysAgo(5),
          statusChangedAt: daysAgo(5),
        }),
        application({
          id: 2,
          company: 'Stale Co',
          appliedAt: daysAgo(60),
          statusChangedAt: daysAgo(60),
        }),
      ]),
    );
    renderApplications();
    await screen.findByText('Fresh Co');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Timeout: 1' }));

    await waitFor(() => expect(screen.queryByText('Fresh Co')).not.toBeInTheDocument());
    expect(screen.getByText('Stale Co')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('TIMEOUT');
  });

  it('optimistically changes a status and keeps it on success', async () => {
    mswServer.use(...buildHandlers([application({ id: 1, status: 'APPLIED' })]));
    renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    const rowSelect = within(screen.getByRole('table')).getByRole('combobox');
    await user.selectOptions(rowSelect, 'INTERVIEW');

    await waitFor(() => expect((rowSelect as HTMLSelectElement).value).toBe('INTERVIEW'));
  });

  it('rolls the status back and shows a row error when the save fails', async () => {
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({ items: [application({ id: 1, status: 'APPLIED' })], total: 1 }),
      ),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', () =>
        HttpResponse.json(null, { status: 500 }),
      ),
    );
    renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    const rowSelect = within(screen.getByRole('table')).getByRole('combobox');
    await user.selectOptions(rowSelect, 'INTERVIEW');

    await screen.findByText(/failed to save|HTTP 500/i);
    expect((rowSelect as HTMLSelectElement).value).toBe('APPLIED');
  });

  it('shows a friendly error when the list response has the wrong shape', async () => {
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({ items: 'not-an-array' }),
      ),
    );
    renderApplications();
    expect(await screen.findByText(/unexpected format/i)).toBeInTheDocument();
  });

  it('renders an applyUrl that fails the scheme gate as text, not a link', async () => {
    // `applyUrl` is scraped, so it is untrusted input that reaches an href. The
    // table used to test only for `tracker://`; it now runs every value through
    // the scheme gate, and this is what that widening is supposed to mean in the
    // DOM: a real link stays a link, everything else becomes plain text.
    mswServer.use(
      ...buildHandlers([
        application({ id: 1, title: 'Ordinary Role', applyUrl: 'https://acme.com/jobs/1' }),
        application({
          id: 2,
          title: 'Synthetic Role',
          applyUrl: 'tracker://acme/synthetic-role/2026-09-01',
        }),
        application({ id: 3, title: 'Hostile Role', applyUrl: 'javascript:alert(1)' }),
      ]),
    );
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
    mswServer.use(
      ...buildHandlers([
        // Freshly recorded: applying is the last move, so a second date line would
        // just repeat the one above it.
        application({ id: 1, title: 'Untouched Role' }),
        application({ id: 2, title: 'Moved Role', statusChangedAt: daysAgo(2) }),
      ]),
    );
    renderApplications();
    await screen.findByText('Untouched Role');

    const rowText = (title: string) =>
      screen.getAllByRole('row').find((r) => r.textContent?.includes(title))?.textContent ?? '';
    expect(rowText('Untouched Role')).not.toMatch(/upd:/);
    expect(rowText('Moved Role')).toMatch(/upd:/);
  });

  it('marks a row that has gone quiet for more than thirty days', async () => {
    mswServer.use(
      ...buildHandlers([
        application({ id: 1, title: 'Stale Role', statusChangedAt: daysAgo(45) }),
        application({ id: 2, title: 'Live Role', statusChangedAt: daysAgo(1) }),
      ]),
    );
    renderApplications();
    await screen.findByText('Stale Role');

    const rowText = (title: string) =>
      screen.getAllByRole('row').find((r) => r.textContent?.includes(title))?.textContent ?? '';
    expect(rowText('Stale Role')).toContain('⏳');
    expect(rowText('Live Role')).not.toContain('⏳');

    // The explanation is a `.tip` bubble like everywhere else, not a native `title`.
    const staleRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('Stale Role'));
    expect(staleRow?.querySelector('.tip')).toHaveTextContent('45 days since last update');
  });

  it('writes the new last-move stamp into the cache optimistically', async () => {
    // writeStatus() restamps statusChangedAt server-side, and the row's ⏳ mark and
    // the Active/Timeout tiles both read that field. Without the mirror in
    // useApplications, a changed row would keep its old bucket until the refetch
    // landed. The PATCH is delayed so the refetch cannot be the one that moved it —
    // otherwise the assertion would pass with the mirror deleted.
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({
          items: [application({ id: 1, status: 'APPLIED' })],
          total: 1,
        }),
      ),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', async ({ params }) => {
        await delay(500);
        return HttpResponse.json(
          application({ id: Number(params.id), status: 'INTERVIEW', statusChangedAt: daysAgo(0) }),
        );
      }),
    );
    const { client } = renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(within(screen.getByRole('table')).getByRole('combobox'), 'INTERVIEW');
    // Let onMutate's `await cancelQueries` settle — and nothing else, since the
    // response is still half a second away.
    await act(async () => {});

    const row = client
      .getQueryData<ApplicationPage>(['applications'])
      ?.items.find((i) => i.id === 1);
    expect(row?.status).toBe('INTERVIEW');
    expect(row?.statusChangedAt).not.toBe(row?.appliedAt);
  });

  it('writes a new applied date when a row is moved back to APPLIED', async () => {
    // The server journals a new APPLIED row, and appliedAt is the latest one — so
    // the cache must not keep the old date (and an "upd:" line) until the refetch.
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({
          items: [application({ id: 1, status: 'REJECTED', statusChangedAt: daysAgo(3) })],
          total: 1,
        }),
      ),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', async ({ params }) => {
        await delay(500);
        return HttpResponse.json(application({ id: Number(params.id) }));
      }),
    );
    const { client } = renderApplications();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(within(screen.getByRole('table')).getByRole('combobox'), 'APPLIED');
    await act(async () => {});

    const row = client
      .getQueryData<ApplicationPage>(['applications'])
      ?.items.find((i) => i.id === 1);
    expect(row?.status).toBe('APPLIED');
    expect(row?.appliedAt).toBe(row?.statusChangedAt);
  });

  it('marks the /vacancies lists stale after a status move — they tag the same rows', async () => {
    mswServer.use(...buildHandlers([application({ id: 1, status: 'APPLIED' })]));
    const { client } = renderApplications();
    await screen.findByText('Acme');
    client.setQueryData(['vacancies', ''], { items: [], total: 0 });

    const user = userEvent.setup();
    await user.selectOptions(within(screen.getByRole('table')).getByRole('combobox'), 'INTERVIEW');

    await waitFor(() => expect(client.getQueryState(['vacancies', ''])?.isInvalidated).toBe(true));
  });

  describe('the Action column', () => {
    it('has only Copy and Edit', async () => {
      mswServer.use(...buildHandlers([application({ id: 1 })]));
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
      mswServer.use(
        ...buildHandlers([
          application({
            id: 1,
            salaryInListing: '100 PLN/h',
            comments: [
              { id: 7, createdAt: '2026-09-01T10:00:00Z', body: 'First note', source: 'USER' },
            ],
          }),
        ]),
      );
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
        [...table.querySelectorAll('.comment-user')].map((el) => el.lastChild?.textContent),
      ).toEqual(['First note', 'Went well.']);
    });

    it('rolls a failed edit back, comment included, and shows the row error', async () => {
      mswServer.use(...buildHandlers([application({ id: 1 })]));
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
