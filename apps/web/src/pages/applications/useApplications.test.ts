import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { buildApplicationHandlers } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import type { ApplicationPage } from './api';
import type { ApplicationListItem } from './types';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function application(overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  // Dates are relative to now, not fixed: the KPI row's Active/Timeout tiles are
  // derived from them, so a literal date would make these tests rot on the calendar.
  const applied = daysAgo(10);
  return {
    id: 1,
    appliedAt: applied,
    status: 'APPLIED',
    // record() stamps this to appliedAt; only updateStatus() moves it on.
    statusUpdatedAt: applied,
    statusComment: null,
    salaryInListing: null,
    usedTailoredResume: false,
    userComment: null,
    createdAt: applied,
    updatedAt: applied,
    estimatedVacancyId: 1,
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/1',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    ...overrides,
  };
}

function renderTracker(path = '/tracker') {
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
      ...buildApplicationHandlers([
        application({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
        application({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
      ]),
    );
    renderTracker();
    await screen.findByText('Acme');
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search company or role/i), 'lead');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('orders rows by applied date, newest first', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, company: 'Older Co', appliedAt: '2026-08-01T00:00:00.000Z' }),
        application({ id: 2, company: 'Newest Co', appliedAt: '2026-09-10T00:00:00.000Z' }),
        application({ id: 3, company: 'Middle Co', appliedAt: '2026-08-20T00:00:00.000Z' }),
      ]),
    );
    renderTracker();
    await screen.findByText('Newest Co');
    // Read the company out of each row's meta cell rather than off a text node:
    // the cell also carries the id, and matching text nodes couples the test to
    // how JSX happens to lay the whitespace out.
    const order = screen
      .getAllByRole('row')
      .map((row) => row.querySelector('.role-meta')?.textContent)
      .filter((cell): cell is string => Boolean(cell))
      .map((cell) => cell.replace(/\s*#\d+$/, ''));
    expect(order).toEqual(['Newest Co', 'Middle Co', 'Older Co']);
  });

  it('filters by status', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, company: 'Acme', status: 'APPLIED' }),
        application({ id: 2, company: 'Beta Corp', status: 'REJECTED' }),
      ]),
    );
    renderTracker();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'REJECTED');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('shows a KPI row counting the whole (unfiltered) log', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, status: 'APPLIED' }),
        application({ id: 2, status: 'REJECTED' }),
        application({ id: 3, status: 'REJECTED' }),
        application({ id: 4, status: 'OFFER' }),
      ]),
    );
    renderTracker();
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
      ...buildApplicationHandlers([
        application({ id: 1, status: 'APPLIED' }),
        application({
          id: 2,
          status: 'INTERVIEW',
          appliedAt: daysAgo(90),
          statusUpdatedAt: daysAgo(2), // moved recently — old application is not stale
        }),
        application({
          id: 3,
          status: 'REPLIED',
          appliedAt: daysAgo(45),
          statusUpdatedAt: daysAgo(45),
        }),
        application({
          id: 4,
          status: 'REJECTED',
          appliedAt: daysAgo(90),
          statusUpdatedAt: daysAgo(90),
        }),
        application({
          id: 5,
          status: 'OFFER',
          appliedAt: daysAgo(90),
          statusUpdatedAt: daysAgo(90),
        }),
      ]),
    );
    renderTracker();
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
      ...buildApplicationHandlers([
        application({
          id: 1,
          company: 'Fresh Co',
          appliedAt: daysAgo(5),
          statusUpdatedAt: daysAgo(5),
        }),
        application({
          id: 2,
          company: 'Stale Co',
          appliedAt: daysAgo(60),
          statusUpdatedAt: daysAgo(60),
        }),
      ]),
    );
    renderTracker();
    await screen.findByText('Fresh Co');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Timeout: 1' }));

    await waitFor(() => expect(screen.queryByText('Fresh Co')).not.toBeInTheDocument());
    expect(screen.getByText('Stale Co')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('TIMEOUT');
  });

  it('optimistically changes a status and keeps it on success', async () => {
    mswServer.use(...buildApplicationHandlers([application({ id: 1, status: 'APPLIED' })]));
    renderTracker();
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
    renderTracker();
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
    renderTracker();
    expect(await screen.findByText(/unexpected format/i)).toBeInTheDocument();
  });

  it('renders an applyUrl that fails the scheme gate as text, not a link', async () => {
    // `applyUrl` is scraped, so it is untrusted input that reaches an href. The
    // table used to test only for `tracker://`; it now runs every value through
    // the scheme gate, and this is what that widening is supposed to mean in the
    // DOM: a real link stays a link, everything else becomes plain text.
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, title: 'Ordinary Role', applyUrl: 'https://acme.com/jobs/1' }),
        application({
          id: 2,
          title: 'Synthetic Role',
          applyUrl: 'tracker://acme/synthetic-role/2026-09-01',
        }),
        application({ id: 3, title: 'Hostile Role', applyUrl: 'javascript:alert(1)' }),
      ]),
    );
    renderTracker();
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
      ...buildApplicationHandlers([
        // Freshly recorded: statusUpdatedAt is stamped to appliedAt, so a second
        // date line would just repeat the one above it.
        application({ id: 1, title: 'Untouched Role' }),
        application({ id: 2, title: 'Moved Role', statusUpdatedAt: daysAgo(2) }),
      ]),
    );
    renderTracker();
    await screen.findByText('Untouched Role');

    const rowText = (title: string) =>
      screen.getAllByRole('row').find((r) => r.textContent?.includes(title))?.textContent ?? '';
    expect(rowText('Untouched Role')).not.toMatch(/upd:/);
    expect(rowText('Moved Role')).toMatch(/upd:/);
  });

  it('marks a row that has gone quiet for more than thirty days', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, title: 'Stale Role', statusUpdatedAt: daysAgo(45) }),
        application({ id: 2, title: 'Live Role', statusUpdatedAt: daysAgo(1) }),
      ]),
    );
    renderTracker();
    await screen.findByText('Stale Role');

    const rowText = (title: string) =>
      screen.getAllByRole('row').find((r) => r.textContent?.includes(title))?.textContent ?? '';
    expect(rowText('Stale Role')).toContain('⏳');
    expect(rowText('Live Role')).not.toContain('⏳');
  });

  it('writes the new last-move stamp into the cache optimistically', async () => {
    // updateStatus() restamps statusUpdatedAt server-side, and the row's ⏳ mark and
    // the Active/Timeout tiles both read that field. Without the mirror in
    // useApplications, a changed row would keep its old bucket until the refetch
    // landed. The PATCH is delayed so the refetch cannot be the one that moved it —
    // otherwise the assertion would pass with the mirror deleted.
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({
          items: [application({ id: 1, status: 'APPLIED', statusUpdatedAt: daysAgo(10) })],
          total: 1,
        }),
      ),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', async ({ params }) => {
        await delay(500);
        return HttpResponse.json(
          application({ id: Number(params.id), status: 'INTERVIEW', statusUpdatedAt: daysAgo(0) }),
        );
      }),
    );
    const { client } = renderTracker();
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
    expect(row?.statusUpdatedAt).not.toBe(row?.appliedAt);
  });
});
