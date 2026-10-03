import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { buildHandlers, type FakeVacancy, fakeVacancy, statsHandler } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

const DAY = 86_400_000;

/** Every status but FILTERED_OUT — All with Hide Filtered out on, the default. */
const ALL_BUT_FILTERED_OUT =
  'NEW,NOT_REVIEWED,SAVED_FOR_LATER,DECLINED,UNAVAILABLE,APPLIED,RECRUITER_SCREEN,REPLIED,INTERVIEW,OFFER,REJECTED';
const EVERY_STATUS =
  'NEW,NOT_REVIEWED,SAVED_FOR_LATER,DECLINED,UNAVAILABLE,FILTERED_OUT,APPLIED,RECRUITER_SCREEN,REPLIED,INTERVIEW,OFFER,REJECTED';

/** Every GET the page and the modal send, by path and query. */
function recordRequests() {
  const requests: URL[] = [];
  mswServer.events.on('request:start', ({ request }) => {
    if (request.method === 'GET') requests.push(new URL(request.url));
  });
  return requests;
}

/** The modal's own list requests: the page tables never send a `search` any more. */
const searches = (requests: URL[]) =>
  requests.filter((url) => url.pathname.endsWith('/vacancies') && url.searchParams.has('search'));

function renderAt(path: string, rows: FakeVacancy[]) {
  mswServer.use(...buildHandlers(rows), statsHandler());
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
}

async function openSearch() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Search' }));
  const dialog = await screen.findByRole('dialog', { name: 'Search vacancies' });
  return { user, modal: within(dialog) };
}

afterEach(() => mswServer.events.removeAllListeners());

describe('SearchModal', () => {
  it.each([
    ['/vacancies', 'NOT_REVIEWED,SAVED_FOR_LATER,DECLINED,UNAVAILABLE'],
    ['/applications', 'APPLIED,RECRUITER_SCREEN,REPLIED,INTERVIEW,OFFER,REJECTED'],
    ['/inbox', 'NEW,FILTERED_OUT'],
  ])("opens from %s's toolbar; Context sends that page's statuses", async (path, context) => {
    const requests = recordRequests();
    renderAt(path, [fakeVacancy()]);
    const { user, modal } = await openSearch();

    await user.type(modal.getByRole('searchbox', { name: /search company or role/i }), 'acme');
    await waitFor(() =>
      expect(searches(requests).at(-1)?.searchParams.get('status')).toBe(ALL_BUT_FILTERED_OUT),
    );
    expect(searches(requests).at(-1)?.searchParams.get('search')).toBe('acme');

    // Every status of the page, whatever its own filter shows (/vacancies' is NOT_REVIEWED).
    await user.click(modal.getByRole('radio', { name: 'Context' }));
    await waitFor(() =>
      expect(searches(requests).at(-1)?.searchParams.get('status')).toBe(context),
    );
  });

  it('All hides FILTERED_OUT only while its box is checked; the box is off under Context', async () => {
    const requests = recordRequests();
    renderAt('/vacancies', [fakeVacancy()]);
    const { user, modal } = await openSearch();

    const group = modal.getByRole('group', { name: 'Search in' });
    expect(within(group).getByRole('radio', { name: 'All' })).toBeChecked();
    const hide = modal.getByRole('checkbox', { name: 'Hide Filtered out' });
    expect(hide).toBeChecked();
    expect(hide).toBeEnabled();

    await user.type(modal.getByRole('searchbox'), 'acme');
    await waitFor(() =>
      expect(searches(requests).at(-1)?.searchParams.get('status')).toBe(ALL_BUT_FILTERED_OUT),
    );
    await user.click(hide);
    await waitFor(() =>
      expect(searches(requests).at(-1)?.searchParams.get('status')).toBe(EVERY_STATUS),
    );

    await user.click(within(group).getByRole('radio', { name: 'Context' }));
    expect(hide).toBeDisabled();
    await user.click(within(group).getByRole('radio', { name: 'All' }));
    expect(hide).toBeEnabled();
  });

  it("shows its results in the company modal's rows, and leaves the page's table alone", async () => {
    renderAt('/vacancies', [
      fakeVacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
      fakeVacancy({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
      // Off the page's filter, and quiet for 45 days: the ⏳ and the CV come from the
      // applications join.
      fakeVacancy({
        id: 3,
        company: 'Acme',
        title: 'Data Engineer',
        status: 'INTERVIEW',
        statusChangedAt: new Date(Date.now() - 45 * DAY).toISOString(),
        usedTailoredResume: true,
      }),
    ]);
    await screen.findByText('Beta Corp');
    const { user, modal } = await openSearch();
    await user.type(modal.getByRole('searchbox'), 'acme');

    await modal.findByText('Data Engineer');
    expect(modal.getByText('2 vacancies, newest first')).toBeInTheDocument();
    expect(modal.queryByText('Frontend Lead')).not.toBeInTheDocument();
    const row = (title: string) => within(modal.getByText(title).closest('tr') as HTMLElement);
    expect(row('Data Engineer').getByText('Interview')).toHaveClass('tag');
    expect(
      row('Backend Engineer').getByRole('button', { name: /copy backend engineer/i }),
    ).toBeInTheDocument();
    expect(
      row('Backend Engineer').getByRole('link', { name: /open vacancy details/i }),
    ).toHaveAttribute('target', '_blank');
    expect((await row('Data Engineer').findByText('⏳')).querySelector('.tip')).toHaveTextContent(
      '45 days since last update',
    );
    // Date, Vacancy, Score, Status, CV, Actions.
    const cv = (title: string) =>
      (modal.getByText(title).closest('tr') as HTMLTableRowElement).cells[4];
    expect(cv('Data Engineer')).toHaveTextContent('✓');
    expect(cv('Backend Engineer')).toHaveTextContent('—');

    // The page's table still lists its own NOT_REVIEWED rows, Beta Corp included.
    const page = within(document.querySelector('.card') as HTMLElement);
    expect(page.getByText('Beta Corp')).toBeInTheDocument();
    expect(page.queryByText('Data Engineer')).not.toBeInTheDocument();
    expect(page.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('asks nothing for an empty or blank term', async () => {
    const requests = recordRequests();
    renderAt('/vacancies', [fakeVacancy()]);
    await screen.findByText('Showing 1 of 1');
    const before = requests.length;

    const { user, modal } = await openSearch();
    expect(modal.getByText('Type a company or role.')).toBeInTheDocument();
    await user.type(modal.getByRole('searchbox'), '   ');
    await user.click(modal.getByRole('radio', { name: 'Context' }));
    await user.click(modal.getByRole('radio', { name: 'All' }));
    // Past the box's 200 ms debounce: absence needs a wait, there is no event to await.
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(requests.slice(before)).toEqual([]);
    expect(modal.queryByRole('table')).not.toBeInTheDocument();
    // The table's place holds an empty state, not nothing.
    expect(modal.getByText('Type a company or role.')).toHaveClass('empty-state');
  });

  it('shows an empty state for no match, and the table once rows come back', async () => {
    renderAt('/vacancies', [fakeVacancy({ company: 'Acme' })]);
    const { user, modal } = await openSearch();
    const box = modal.getByRole('searchbox');

    await user.type(box, 'zzz');
    expect(await modal.findByText('No vacancies match.')).toHaveClass('empty-state');
    expect(modal.queryByRole('table')).not.toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'acme');
    expect(await modal.findByRole('table')).toBeInTheDocument();
    expect(modal.queryByText('No vacancies match.')).not.toBeInTheDocument();
  });
});
