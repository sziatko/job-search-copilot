import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '@/router';
import { buildHandlers, type FakeVacancy, fakeVacancy } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

function renderInbox(rows: FakeVacancy[], path = '/inbox') {
  mswServer.use(...buildHandlers(rows));
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
  return router;
}

/** The list requests the page sent, as their query strings. */
function recordListQueries(): Record<string, string>[] {
  const queries: Record<string, string>[] = [];
  mswServer.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/vacancies')) {
      queries.push(Object.fromEntries(url.searchParams));
    }
  });
  return queries;
}

function rowOf(company: string) {
  const row = screen.getByText(company).closest('tr');
  if (!row) throw new Error(`No row for ${company}`);
  return within(row);
}

/** Every status button a row can carry, by its bubble — Copy and Details are not
 * status changes. */
const STATUS_VERBS = [
  'Apply',
  'Decline',
  'Save for later',
  'Mark unavailable',
  'Mark not reviewed',
  'Filter out',
  'Back to queue',
];
function offered(company: string) {
  return STATUS_VERBS.filter((name) => rowOf(company).queryByRole('button', { name }));
}

const unanalysed = { matchScore: null, recommendation: null, estimationComment: null } as const;

// A function, not a constant: the fake moves the rows it is given in place.
const inbox = () => [
  fakeVacancy({ id: 1, company: 'Queued Co', status: 'NEW', ...unanalysed }),
  fakeVacancy({ id: 2, company: 'Textless Co', status: 'NEW', fullText: null, ...unanalysed }),
  fakeVacancy({ id: 3, company: 'Mine Co', status: 'FILTERED_OUT', ...unanalysed }),
  fakeVacancy({ id: 4, company: 'Skipped Co', status: 'FILTERED_OUT', recommendation: 'SKIP' }),
  fakeVacancy({ id: 5, company: 'Triaged Co', status: 'NOT_REVIEWED' }),
];

describe('InboxPage', () => {
  afterEach(() => {
    mswServer.events.removeAllListeners();
    vi.restoreAllMocks();
  });

  it('opens on the Queue: NEW with posting text, asked of the server', async () => {
    const queries = recordListQueries();
    renderInbox(inbox());

    expect(await screen.findByText('Queued Co')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Queue', pressed: true })).toBeInTheDocument();
    for (const other of ['Textless Co', 'Mine Co', 'Skipped Co', 'Triaged Co']) {
      expect(screen.queryByText(other)).not.toBeInTheDocument();
    }
    expect(rowOf('Queued Co').getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument();
    expect(queries).toEqual([{ limit: '100', status: 'NEW', hasText: 'true' }]);
  });

  it('switches to No text and Filtered out, keeping the tab in the URL', async () => {
    const queries = recordListQueries();
    const router = renderInbox(inbox());
    await screen.findByText('Queued Co');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'No text' }));
    expect(await screen.findByText('Textless Co')).toBeInTheDocument();
    expect(screen.queryByText('Queued Co')).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ tab: 'no-text' });

    // Both the user's and the analyzer's.
    await user.click(screen.getByRole('button', { name: 'Filtered out' }));
    expect(await screen.findByText('Mine Co')).toBeInTheDocument();
    expect(rowOf('Mine Co').getByText('Filtered out')).toBeInTheDocument();
    expect(screen.getByText('Skipped Co')).toBeInTheDocument();
    expect(screen.queryByText('Textless Co')).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ tab: 'filtered-out' });

    expect(queries.slice(1)).toEqual([
      { limit: '100', status: 'NEW', hasText: 'false' },
      { limit: '100', status: 'FILTERED_OUT' },
    ]);
  });

  it('opens the tab the URL names', async () => {
    renderInbox(inbox(), '/inbox?tab=no-text');
    expect(await screen.findByText('Textless Co')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No text', pressed: true })).toBeInTheDocument();
  });

  it('falls back to the Queue on a junk ?tab=', async () => {
    renderInbox(inbox(), '/inbox?tab=BOGUS');
    expect(await screen.findByText('Queued Co')).toBeInTheDocument();
  });

  it('says so when a tab is empty', async () => {
    renderInbox([], '/inbox?tab=filtered-out');
    expect(await screen.findByText('Nothing has been filtered out.')).toBeInTheDocument();
  });

  it('offers Filter out on a NEW row, Back to queue only on an unanalysed FILTERED_OUT one', async () => {
    renderInbox(inbox());
    await screen.findByText('Queued Co');
    expect(offered('Queued Co')).toEqual(['Filter out']);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Filtered out' }));
    await screen.findByText('Mine Co');
    expect(offered('Mine Co')).toEqual(['Back to queue']);
    // The server refuses NEW on an analysed row, so it is not offered.
    expect(offered('Skipped Co')).toEqual([]);
  });

  it('filters a NEW row out, says so, and the row leaves the queue', async () => {
    const success = vi.spyOn(toast, 'success');
    const rows = inbox();
    renderInbox(rows);
    await screen.findByText('Queued Co');

    await userEvent.setup().click(rowOf('Queued Co').getByRole('button', { name: 'Filter out' }));

    await waitFor(() => expect(screen.queryByText('Queued Co')).not.toBeInTheDocument());
    expect(rows[0].status).toBe('FILTERED_OUT');
    expect(success).toHaveBeenCalledWith('Moved to Filtered out', {
      description: 'Backend Engineer — Queued Co',
    });
  });

  it('puts an unanalysed filtered-out row back in the queue', async () => {
    const success = vi.spyOn(toast, 'success');
    const rows = inbox();
    renderInbox(rows, '/inbox?tab=filtered-out');
    await screen.findByText('Mine Co');

    await userEvent.setup().click(rowOf('Mine Co').getByRole('button', { name: 'Back to queue' }));

    await waitFor(() => expect(screen.queryByText('Mine Co')).not.toBeInTheDocument());
    expect(rows[2].status).toBe('NEW');
    expect(success).toHaveBeenCalledWith('Moved to New', {
      description: 'Backend Engineer — Mine Co',
    });
  });
});
