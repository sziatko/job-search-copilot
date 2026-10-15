import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '@/router';
import {
  buildHandlers,
  type FakeVacancy,
  fakeVacancy,
  holdGet,
  vacanciesResolver,
} from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import { expectLoadedTable, expectSkeletonTable } from '@/test/skeleton';
import type { VacancyListItem } from './types';

const vacancy = fakeVacancy;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

/**
 * Page-level, not `renderHook`: the status filter lives in the route's search
 * params, so `useVacancies` calls `useSearch` and throws without a router above
 * it. Same shape as `renderApplications` in the tracker's test.
 */
function renderVacancies(path = '/vacancies') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
    ),
  };
}

/** The company out of each rendered row's meta cell. Reading it from the cell
 * rather than off a text node: the cell also carries the id, and matching text
 * nodes couples the test to how JSX happens to lay out whitespace. */
function rowCompanies() {
  return screen
    .getAllByRole('row')
    .map((row) => row.querySelector('.role-meta')?.textContent)
    .filter((cell): cell is string => Boolean(cell))
    .map((cell) => cell.replace(/\s*#\d+$/, ''));
}

/** One row's own controls, scoped by company: the toolbar holds a `<select>`, and
 * every row carries the same four buttons. */
function rowOf(company: string) {
  const row = screen.getByText(company).closest('tr');
  if (!row) throw new Error(`No row for ${company}`);
  return within(row);
}

/** The status buttons a row offers, by their bubbles, in the order the row renders
 * them. Copy and Details are not status changes, so they are not in the list. */
const STATUS_VERBS = [
  'Apply',
  'Decline',
  'Save for later',
  'Mark unavailable',
  'Mark not reviewed',
];
function offered(company: string) {
  return STATUS_VERBS.filter((name) => rowOf(company).queryByRole('button', { name }));
}

/** Save for later through its dialog: the row button opens it, OK (or Enter in the
 * comment) sends it. */
async function saveForLater(user: ReturnType<typeof userEvent.setup>, company: string) {
  await user.click(rowOf(company).getByRole('button', { name: 'Save for later' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Save for later' }),
  );
}

/** The bodies of the PATCH /status requests sent, in order. */
function recordStatusBodies(): unknown[] {
  const bodies: unknown[] = [];
  mswServer.events.on('request:start', async ({ request }) => {
    if (request.method === 'PATCH' && request.url.endsWith('/status')) {
      bodies.push(await request.clone().json());
    }
  });
  return bodies;
}

/** What `ALL` sends on /vacancies — the page's context. */
const CONTEXT_STATUSES = 'NOT_REVIEWED,SAVED_FOR_LATER,DECLINED,UNAVAILABLE';

/** A promise a test releases by hand — one held request, no timer to race. */
function gate() {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release: () => release() };
}

/** Row #1's cached status, out of an infinite query's `pages[]`. */
function cachedStatus(client: QueryClient, key: readonly string[]) {
  return client
    .getQueryData<InfiniteData<{ items: VacancyListItem[] }>>(key)
    ?.pages.flatMap((page) => page.items)
    .find((item) => item.id === 1)?.status;
}

// The toast spies below are file-scoped: a spy that outlives the test it belongs
// to makes the next one's assertion meaningless.
afterEach(() => {
  vi.restoreAllMocks();
  mswServer.events.removeAllListeners();
});

describe('VacanciesPage / useVacancies', () => {
  it('defaults to the NOT_REVIEWED filter and hides everything else', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Declined Co', status: 'DECLINED' }),
        vacancy({ id: 3, company: 'Applied Co', status: 'APPLIED' }),
      ]),
    );
    renderVacancies();

    await screen.findByText('Acme');
    expect(screen.queryByText('Declined Co')).not.toBeInTheDocument();
    expect(screen.queryByText('Applied Co')).not.toBeInTheDocument();
  });

  it("offers only the page's own statuses, and All lists only those", async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Fresh Co' }),
        vacancy({ id: 2, company: 'Saved Co', status: 'SAVED_FOR_LATER' }),
        vacancy({ id: 3, company: 'Declined Co', status: 'DECLINED' }),
        vacancy({ id: 4, company: 'Closed Co', status: 'UNAVAILABLE' }),
        // /inbox's and /applications' rows, never this page's.
        vacancy({ id: 5, company: 'Queued Co', status: 'NEW', recommendation: null }),
        vacancy({ id: 6, company: 'Screened Co', status: 'FILTERED_OUT', recommendation: null }),
        vacancy({ id: 7, company: 'Applied Co', status: 'APPLIED' }),
        vacancy({ id: 8, company: 'Interview Co', status: 'INTERVIEW' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Fresh Co');

    const user = userEvent.setup();
    const filter = screen.getByLabelText('Status');
    // No Applied: the pipeline is /applications'.
    expect([...(filter as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Not reviewed',
      'Saved for later',
      'Declined',
      'Unavailable',
      'All',
    ]);

    const companies = () =>
      screen
        .getAllByRole('row')
        .map((row) => row.querySelector('.role-meta')?.textContent ?? '')
        .filter(Boolean)
        .map((cell) => cell.replace(/\s*#\d+$/, ''))
        .sort();
    await user.selectOptions(filter, 'ALL');
    await screen.findByText('Closed Co');
    expect(companies()).toEqual(['Closed Co', 'Declined Co', 'Fresh Co', 'Saved Co']);

    await user.selectOptions(filter, 'SAVED_FOR_LATER');
    await waitFor(() => expect(companies()).toEqual(['Saved Co']));
    await user.selectOptions(filter, 'DECLINED');
    await waitFor(() => expect(companies()).toEqual(['Declined Co']));
  });

  it('sorts by recommendation (APPLY first) then by match score descending', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Skip Co', recommendation: 'SKIP', matchScore: 90 }),
        vacancy({ id: 2, company: 'Low Co', recommendation: 'APPLY', matchScore: 60 }),
        vacancy({ id: 3, company: 'High Co', recommendation: 'APPLY', matchScore: 95 }),
        vacancy({ id: 4, company: 'Caveats Co', recommendation: 'APPLY_WITH_CAVEATS' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Skip Co');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');

    await waitFor(() =>
      expect(rowCompanies()).toEqual(['High Co', 'Low Co', 'Caveats Co', 'Skip Co']),
    );
  });

  it("sends the status filter to the server, All as the page's statuses", async () => {
    const lists: URLSearchParams[] = [];
    const onRequest = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname.endsWith('/vacancies')) {
        lists.push(url.searchParams);
      }
    };
    mswServer.events.on('request:start', onRequest);
    try {
      mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
      renderVacancies();
      await screen.findByText('Acme');
      expect(lists.at(-1)?.get('status')).toBe('NOT_REVIEWED');
      expect(lists.at(-1)?.get('sort')).toBe('recommended');

      const user = userEvent.setup();
      await user.selectOptions(screen.getByLabelText('Status'), 'DECLINED');
      await waitFor(() => expect(lists.at(-1)?.get('status')).toBe('DECLINED'));
      await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
      await waitFor(() => expect(lists.at(-1)?.get('status')).toBe(CONTEXT_STATUSES));
    } finally {
      mswServer.events.removeListener('request:start', onRequest);
    }
  });

  it('takes the status filter from the URL', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Declined Co', status: 'DECLINED' }),
      ]),
    );
    renderVacancies('/vacancies?status=DECLINED');

    await screen.findByText('Declined Co');
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('DECLINED');
  });

  it('falls back to Not reviewed on a bookmarked ?status=APPLIED', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Applied Co', status: 'APPLIED' }),
      ]),
    );
    renderVacancies('/vacancies?status=APPLIED');

    // The filter's old pipeline entry: the default, not an error page.
    await screen.findByText('Acme');
    expect(screen.queryByText('Applied Co')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('NOT_REVIEWED');
  });

  it('loads the next page on scroll, and an optimistic write reaches it', async () => {
    // 130 rows tied on recommendation and score: `id desc`, so the last is #1.
    mswServer.use(
      ...buildHandlers(
        Array.from({ length: 130 }, (_, i) =>
          vacancy({ id: i + 1, company: `Co ${i + 1}`, applyUrl: `https://example.com/${i + 1}` }),
        ),
      ),
    );
    const patch = gate();
    mswServer.use(
      http.patch('http://localhost:3000/api/v1/vacancies/:id/status', async () => {
        await patch.held;
        return HttpResponse.json(null, { status: 500 });
      }),
    );
    const { client } = renderVacancies();
    await screen.findByText('Showing 100 of 130');

    // jsdom lays nothing out: set the offset the virtualizer reads, then tell it.
    const scroller = document.querySelector('.table-body-scroll') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 10_000_000 });
    fireEvent.scroll(scroller);
    await screen.findByText('Showing 130 of 130');

    const user = userEvent.setup();
    await saveForLater(user, 'Co 1');

    const secondPage = () =>
      client.getQueryData<InfiniteData<{ items: VacancyListItem[] }>>(['vacancies', 'NOT_REVIEWED'])
        ?.pages[1].items;
    await waitFor(() =>
      expect(secondPage()?.find((item) => item.id === 1)?.status).toBe('SAVED_FOR_LATER'),
    );
    patch.release();
  });

  it('shows one title and puts the count in the footer', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Acme', title: 'Data Engineer' }),
        vacancy({ id: 3, company: 'Beta Corp', status: 'DECLINED' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Backend Engineer');

    // The title belongs to the shell's <h1>; the card does not repeat it.
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Analyzed vacancies' }),
    ).not.toBeInTheDocument();
    // 2 of 2: the status filter is the server's now, so `total` counts it too.
    // The count leads the toolbar; the table has no foot.
    expect(screen.getByText('Showing 2 of 2').closest('.toolbar')).not.toBeNull();
    expect(document.querySelector('.table-foot')).toBeNull();
  });

  it('draws skeleton rows under its header while the first page loads', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    const hold = holdGet('/vacancies');
    mswServer.use(hold.handler);
    renderVacancies();

    const table = await expectSkeletonTable('Vacancy');
    hold.release();
    await expectLoadedTable(table, 'Backend Engineer');
  });

  it('shows — for a posting the analyzer never saw', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme', matchScore: 80 }),
        vacancy({
          id: 2,
          company: 'Acme',
          title: 'Imported Role',
          applyUrl: 'tracker://import/2',
          matchScore: null,
          recommendation: null,
          estimationComment: null,
        }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Backend Engineer');

    // Scoped by title, since both rows share a company and `rowOf` matches any text
    // in the row. Before this step the placeholder rendered a real-looking `0%`.
    const imported = rowOf('Imported Role');
    expect(imported.queryByText('0%')).not.toBeInTheDocument();
    // Three dashes: the score, the verdict, and the Comment column, which has no
    // analyzer comment to show (`estimationComment: null`).
    expect(imported.getAllByText('—')).toHaveLength(3);
    // …and the analysed row keeps its pill: the dash is about the analysis, not
    // about the row being an import or its link being unusable.
    expect(rowOf('Backend Engineer').getByText('80%')).toBeInTheDocument();
  });

  it('shows the current status as a tag', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme', status: 'SAVED_FOR_LATER' }),
        vacancy({ id: 2, company: 'Beta Corp', status: 'DECLINED' }),
      ]),
    );
    renderVacancies();
    // No row is NOT_REVIEWED, so the default filter starts on the empty state.
    await screen.findByText(/no vacancies match this filter/i);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');

    // Scoped by `.tag`: the Status column, not a button's bubble.
    expect(rowOf('Acme').getByText('Saved for later', { selector: '.tag' })).toBeInTheDocument();
    expect(rowOf('Beta Corp').getByText('Declined', { selector: '.tag' })).toBeInTheDocument();
  });

  it('opens a dialog for Save for later; an empty one sends no comment, and says so', async () => {
    const success = vi.spyOn(toast, 'success');
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    const bodies = recordStatusBodies();
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Save for later' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('textbox', { name: 'Comment' })).toHaveValue('');
    // Whitespace only counts as empty.
    await user.type(dialog.getByRole('textbox', { name: 'Comment' }), '   ');
    await user.click(dialog.getByRole('button', { name: 'Save for later' }));

    // NOT_REVIEWED filter still active -> the row drops out.
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    await waitFor(() => expect(bodies).toEqual([{ status: 'SAVED_FOR_LATER' }]));
    // The row is gone from view, so the toast names it.
    expect(success).toHaveBeenCalledWith('Moved to Saved for later', {
      description: expect.stringMatching(/ — Acme$/),
    });
  });

  it('sends the Save for later comment with the move', async () => {
    const items = [vacancy({ id: 1, company: 'Acme' })];
    mswServer.use(...buildHandlers(items));
    const bodies = recordStatusBodies();
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Save for later' }));
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'After the holidays.{Enter}');

    await waitFor(() =>
      expect(bodies).toEqual([{ status: 'SAVED_FOR_LATER', comment: 'After the holidays.' }]),
    );
    expect(items[0].comments.at(-1)).toMatchObject({ source: 'USER', body: 'After the holidays.' });
  });

  it('cancels a pending Save for later without saving it', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    const bodies = recordStatusBodies();
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Save for later' }));
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Never mind');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('sets Unavailable with no confirm, and filters by it', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Beta Corp', status: 'DECLINED' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Mark unavailable' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Status'), 'UNAVAILABLE');
    expect(await rowOf('Acme').findByText('Unavailable', { selector: '.tag' })).toBeInTheDocument();
    expect(screen.queryByText('Beta Corp')).not.toBeInTheDocument();
  });

  it('sets a reviewed row back to Not reviewed', async () => {
    mswServer.use(
      ...buildHandlers([vacancy({ id: 1, company: 'Acme', status: 'SAVED_FOR_LATER' })]),
    );
    renderVacancies();
    // The one row is SAVED_FOR_LATER, so the default filter starts on the empty state.
    await screen.findByText(/no vacancies match this filter/i);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    expect(rowOf('Acme').getByText('Saved for later', { selector: '.tag' })).toBeInTheDocument();

    await user.click(rowOf('Acme').getByRole('button', { name: 'Mark not reviewed' }));

    await waitFor(() =>
      expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument(),
    );
  });

  it('offers every status but the one the row already has', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Fresh Co' }),
        vacancy({ id: 2, company: 'Saved Co', status: 'SAVED_FOR_LATER' }),
        vacancy({ id: 3, company: 'Declined Co', status: 'DECLINED' }),
        vacancy({ id: 4, company: 'Closed Co', status: 'UNAVAILABLE' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Fresh Co');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    await screen.findByText('Closed Co');

    // Four quick actions on every row: the server refuses a triage repeat.
    expect(offered('Fresh Co')).toEqual(['Apply', 'Decline', 'Save for later', 'Mark unavailable']);
    expect(offered('Saved Co')).toEqual([
      'Apply',
      'Decline',
      'Mark unavailable',
      'Mark not reviewed',
    ]);
    expect(offered('Declined Co')).toEqual([
      'Apply',
      'Save for later',
      'Mark unavailable',
      'Mark not reviewed',
    ]);
    expect(offered('Closed Co')).toEqual([
      'Apply',
      'Decline',
      'Save for later',
      'Mark not reviewed',
    ]);
  });

  it('locks the status controls of a row just applied to until the refetch drops it', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Saved Co', status: 'SAVED_FOR_LATER' }),
      ]),
    );
    // The refetch after the apply is held: until it lands, the row is still on the page,
    // APPLIED, and no longer saving — the only way a pipeline row reaches this table.
    let holding = false;
    const hold = holdGet('/vacancies', () => holding);
    mswServer.use(hold.handler);
    renderVacancies('/vacancies?status=ALL');
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Apply' }));
    holding = true;
    await user.click(screen.getByRole('button', { name: 'OK' }));

    // Applied and no longer saving, in one render: before the POST lands the tag is
    // there too, with every control disabled by the save. Its status moves on
    // /applications; copying it is still useful here.
    await waitFor(() => {
      expect(rowOf('Acme').getByText('Applied', { selector: '.tag' })).toBeInTheDocument();
      expect(rowOf('Acme').getByRole('button', { name: /^Copy / })).toBeEnabled();
    });
    // A pipeline row counts as Applied.
    expect(offered('Acme')).toEqual([
      'Decline',
      'Save for later',
      'Mark unavailable',
      'Mark not reviewed',
    ]);
    for (const name of offered('Acme')) {
      expect(rowOf('Acme').getByRole('button', { name })).toBeDisabled();
    }
    // A triage row keeps all of them.
    expect(offered('Saved Co')).toHaveLength(4);
    for (const name of offered('Saved Co')) {
      expect(rowOf('Saved Co').getByRole('button', { name })).toBeEnabled();
    }

    hold.release();
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
  });

  it('disables every control in a row while its save is in flight', async () => {
    const items = [vacancy({ id: 1, company: 'Acme' })];
    mswServer.use(...buildHandlers(items));
    // A slow PATCH, so the in-flight state is observable rather than a race.
    mswServer.use(
      http.patch('http://localhost:3000/api/v1/vacancies/:id/status', async () => {
        await delay(300);
        items[0].status = 'SAVED_FOR_LATER';
        return HttpResponse.json(items[0]);
      }),
    );
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    await saveForLater(user, 'Acme');

    // All four in one `waitFor`: they come from the same `saving` flag, so they
    // have to agree on a single render — checking them one at a time can catch the
    // first disabled and the second already back. Only buttons both statuses offer:
    // the write is optimistic, so Save for later may already have left the row.
    await waitFor(() => {
      expect(rowOf('Acme').getByRole('button', { name: 'Apply' })).toBeDisabled();
      expect(rowOf('Acme').getByRole('button', { name: 'Decline' })).toBeDisabled();
      expect(rowOf('Acme').getByRole('button', { name: 'Mark unavailable' })).toBeDisabled();
      expect(rowOf('Acme').getByRole('button', { name: /^Copy / })).toBeDisabled();
    });

    await waitFor(() =>
      expect(rowOf('Acme').getByText('Saved for later', { selector: '.tag' })).toBeInTheDocument(),
    );
  });

  it('requires confirmation before persisting DECLINED', async () => {
    const success = vi.spyOn(toast, 'success');
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Decline' }));

    expect(screen.getByText('Decline this vacancy?')).toBeInTheDocument();
    // Nothing saved yet — the row is still listed, and nothing announced.
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(success).not.toHaveBeenCalledWith('Moved to Declined', expect.anything());

    await user.click(screen.getByRole('button', { name: 'Yes, decline' }));
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(success).toHaveBeenCalledWith('Moved to Declined', {
      description: expect.stringMatching(/ — Acme$/),
    });
  });

  it('cancels a pending decline without saving it', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Decline' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Decline this vacancy?')).not.toBeInTheDocument();
    expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument();
  });

  it('requires confirmation before persisting APPLIED, then records the application', async () => {
    const success = vi.spyOn(toast, 'success');
    const items = [vacancy({ id: 1, company: 'Acme' })];
    mswServer.use(...buildHandlers(items));

    let recorded: unknown;
    mswServer.use(
      http.post('http://localhost:3000/api/v1/applications', async ({ request }) => {
        recorded = await request.json();
        // The real POST moves the vacancy to APPLIED in the same transaction, so the
        // fake has to as well or the refetch after the mutation puts the row straight
        // back.
        const now = new Date().toISOString();
        Object.assign(items[0], { status: 'APPLIED', statusChangedAt: now, appliedAt: now });
        return HttpResponse.json({
          application: { ...items[0], timedOut: false },
          resolution: 'linked-by-id',
          vacancyCreated: false,
        });
      }),
    );

    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('Mark as applied')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Salary / rate'), '130 PLN/h');
    await user.click(screen.getByLabelText('Used a tailored resume'));
    await user.type(screen.getByLabelText('Comment'), 'Adapted CV.');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() =>
      expect(recorded).toMatchObject({
        vacancyId: 1,
        salaryInApplication: '130 PLN/h',
        usedTailoredResume: true,
        comment: 'Adapted CV.',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    // The other half: a successful apply still says so. Against the spy, because
    // the Toaster lives in main.tsx, outside the route tree.
    expect(success).toHaveBeenCalledWith('Application submitted!');
  });

  it('reports a failed apply as a failure, quoting the server', async () => {
    // The success toast fires from the mutation's `onSuccess`; spying on it is the
    // assertion that survives the dialog unmounting — the page itself cannot be
    // asked, and the Toaster is mounted in main.tsx, not in the route tree.
    const success = vi.spyOn(toast, 'success');
    try {
      mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
      mswServer.use(
        http.post('http://localhost:3000/api/v1/applications', () =>
          // The API's own body shape for a refusal (apps/api's DomainExceptionFilter).
          HttpResponse.json(
            {
              statusCode: 422,
              error: 'AlreadyAppliedError',
              message: 'Already recorded.',
            },
            { status: 422 },
          ),
        ),
      );
      renderVacancies();
      await screen.findByText('Acme');

      const user = userEvent.setup();
      await user.click(rowOf('Acme').getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'OK' }));

      // The row's own line, carrying the server's message rather than `HTTP 422`…
      await screen.findByText('Already recorded.');
      // …and the row is back where it was, not optimistically applied.
      expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument();
      expect(success).not.toHaveBeenCalledWith('Application submitted!');
    } finally {
      success.mockRestore();
    }
  });

  /**
   * Holds the list request for one `status` open until the test releases it, so a
   * test can act inside the window where `keepPreviousData` is showing the *older*
   * filter's page, and the filter just picked has no cache entry yet.
   *
   * The handler answers the held request itself rather than delegating — MSW's
   * `passthrough()` is not "try the next handler", it is "make the **real** request",
   * which here would hit the dev API on :3000 and fill the test with real vacancies.
   */
  function holdStatusRequest(status: string, items: FakeVacancy[]) {
    const held = gate();
    const state = { started: 0, release: held.release };
    // Everything but the held filter goes straight to the shared fake. The wrapper
    // must answer *every* list request, so delegating is what keeps it honest —
    // and it makes handler order irrelevant.
    const serve = vacanciesResolver(items);
    const handler = http.get('http://localhost:3000/api/v1/vacancies', async (info) => {
      if (new URL(info.request.url).searchParams.get('status') !== status) {
        return serve(info);
      }
      state.started += 1;
      await held.held;
      return serve(info);
    });
    return { handler, state };
  }

  it('writes an action into the cached page that exists while a filter loads', async () => {
    const items = [vacancy({ id: 1, company: 'Acme' }), vacancy({ id: 2, company: 'Beta Corp' })];
    const gate = holdStatusRequest(CONTEXT_STATUSES, items);
    mswServer.use(gate.handler, ...buildHandlers(items));
    const { client } = renderVacancies();
    await screen.findByText('Acme');

    // The page's own entry, NOT_REVIEWED, stays in the cache untouched by a refetch:
    // once the filter moves on, nothing observes it.
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    await waitFor(() => expect(gate.state.started).toBe(1));
    // Inside the window: the filter just picked has no cache entry, and the rows on
    // screen are the *older* filter's page, held by `keepPreviousData`.
    expect(client.getQueryData(['vacancies', 'ALL'])).toBeUndefined();

    await saveForLater(user, 'Acme');

    // The optimistic write lands on the entry that exists — the exact-key write it
    // replaced hit the absent one and did nothing. Asserted on the cache, not the
    // screen: the screen cannot show it either way, because `keepPreviousData`
    // freezes the placeholder to the result it first produced and never re-reads the
    // entry underneath (see the comment in useVacancies.ts).
    await waitFor(() =>
      expect(cachedStatus(client, ['vacancies', 'NOT_REVIEWED'])).toBe('SAVED_FOR_LATER'),
    );
    expect(client.getQueryData(['vacancies', 'ALL'])).toBeUndefined();
    // …and the frozen page is still what is on screen, unchanged.
    expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument();

    gate.state.release();
  });

  it('restores the cached page it wrote when the save fails mid-filter-change', async () => {
    const items = [vacancy({ id: 1, company: 'Acme' }), vacancy({ id: 2, company: 'Beta Corp' })];
    const list = holdStatusRequest(CONTEXT_STATUSES, items);
    // The PATCH is held too: the point of this test is the state *between* the
    // optimistic write and the failure, and without a hold the 500 lands before the
    // patched value can be read — leaving an assertion that a rollback that never
    // ran would also satisfy.
    const patch = gate();
    const patchState = { started: 0 };
    mswServer.use(list.handler, ...buildHandlers(items));
    // A second `use()` call, not another entry in the same one: `use` prepends, so
    // a later call's handlers take priority — while within one call the first entry
    // wins. In the same call this override would lose to `buildHandlers`' PATCH.
    mswServer.use(
      http.patch('http://localhost:3000/api/v1/vacancies/:id/status', async () => {
        patchState.started += 1;
        await patch.held;
        return HttpResponse.json(null, { status: 500 });
      }),
    );
    const { client } = renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    await waitFor(() => expect(list.state.started).toBe(1));

    await saveForLater(user, 'Acme');

    // Mid-flight: the optimistic write is *in* the cached page, which is what makes
    // the rollback below a real rollback rather than a no-op on an untouched entry.
    await waitFor(() => expect(patchState.started).toBe(1));
    const cached = () => cachedStatus(client, ['vacancies', 'NOT_REVIEWED']);
    expect(cached()).toBe('SAVED_FOR_LATER');

    // Now let it fail: the row says so, and the page it wrote is back to what it held.
    patch.release();
    await screen.findByText(/Failed to update vacancy 1/);
    expect(cached()).toBe('NOT_REVIEWED');
    expect(client.getQueryData(['vacancies', 'ALL'])).toBeUndefined();

    list.state.release();
  });

  it('surfaces a row error and rolls the row back when the save fails', async () => {
    const success = vi.spyOn(toast, 'success');
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    mswServer.use(
      http.patch('http://localhost:3000/api/v1/vacancies/:id/status', () =>
        HttpResponse.json(null, { status: 500 }),
      ),
    );
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await saveForLater(user, 'Acme');

    // The optimistic write put the row out of the NOT_REVIEWED view; the rollback
    // has to bring it back, tag and all.
    await screen.findByText(/Failed to update vacancy 1/);
    expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument();
    expect(success).not.toHaveBeenCalledWith('Moved to Saved for later', expect.anything());
  });

  it('surfaces a friendly loadError when the list response has the wrong shape', async () => {
    mswServer.use(
      http.get('http://localhost:3000/api/v1/vacancies', () =>
        HttpResponse.json({ items: 'not-an-array' }),
      ),
    );
    renderVacancies();

    await screen.findByText(/unexpected format/i);
  });

  describe('the duplicates button and its modal', () => {
    /** Two Acme rows (so each offers one other) and a lone Beta row. */
    function companyFixtures() {
      return [
        vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
        vacancy({ id: 2, company: 'Acme', title: 'Data Engineer' }),
        vacancy({ id: 3, company: 'Beta Corp', title: 'Frontend Lead' }),
      ];
    }

    it('offers the other matches only on rows whose company has siblings', async () => {
      mswServer.use(...buildHandlers(companyFixtures()));
      renderVacancies();
      await screen.findByText('Backend Engineer');

      // Acme has 2, so both Acme rows report the 1 *other* match; Beta has none.
      // (Scoped to the button's own wording: every row also has a Copy button,
      // whose label carries the company too.)
      const buttons = screen.getAllByRole('button', { name: /1 other vacancy at Acme/i });
      expect(buttons).toHaveLength(2);
      expect(
        screen.queryByRole('button', { name: /other vacancies? at Beta Corp/i }),
      ).not.toBeInTheDocument();

      // The sentence is a `.tip` bubble like the Action column's, not a native
      // `title` — the count alone is what the button shows.
      expect(buttons[0].querySelector('.tip')).toHaveTextContent('1 other vacancy at Acme');
      expect(buttons[0]).not.toHaveAttribute('title');
      // Exact, so it fails if the count stops being hidden: that name would then
      // read "1 1 other vacancy at Acme", which the regex above still matches.
      expect(buttons[0]).toHaveAccessibleName('1 other vacancy at Acme');
    });

    it('lists every vacancy of that company, with its status and row actions', async () => {
      const rows = companyFixtures();
      rows[1].status = 'INTERVIEW';
      mswServer.use(...buildHandlers(rows));
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      expect(modal.getByText('All vacancies at Acme')).toBeInTheDocument();
      expect(modal.getByText('Backend Engineer')).toBeInTheDocument();
      expect(modal.getByText('Data Engineer')).toBeInTheDocument();
      expect(modal.queryByText('Frontend Lead')).not.toBeInTheDocument();
      // The vacancy's own status, not a join against the applications query.
      const modalRow = (title: string) =>
        within(modal.getByText(title).closest('tr') as HTMLElement);
      expect(modalRow('Backend Engineer').getByText('Not reviewed')).toHaveClass('tag');
      expect(modalRow('Data Engineer').getByText('Interview')).toHaveClass('tag');
      expect(
        modalRow('Data Engineer').getByRole('link', { name: /open vacancy details/i }),
      ).toHaveAttribute('href', '/vacancies/2');
      expect(
        modalRow('Data Engineer').getByRole('button', { name: /copy data engineer/i }),
      ).toBeInTheDocument();
    });

    it('draws skeleton rows under its header while the company loads', async () => {
      mswServer.use(...buildHandlers(companyFixtures()));
      // The modal's request only: the page's own list carries no `sameCompanyAs`.
      const hold = holdGet('/vacancies', (url) => url.searchParams.has('sameCompanyAs'));
      mswServer.use(hold.handler);
      renderVacancies();
      await screen.findByText('Backend Engineer');

      await userEvent
        .setup()
        .click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);
      const modal = within(await screen.findByRole('dialog'));
      const table = await expectSkeletonTable('Vacancy', modal);
      // The subtitle keeps its visible "Loading…" too.
      expect(modal.getByText('Loading…', { selector: '.dialog-sub' })).toBeInTheDocument();
      hold.release();
      await expectLoadedTable(table, 'Data Engineer');
    });

    it('refetches on every open, so a status changed since shows', async () => {
      mswServer.use(...buildHandlers(companyFixtures()));
      // Every status, so the row stays in the table once it leaves NOT_REVIEWED.
      const { client } = renderVacancies('/vacancies?status=ALL');
      // The app's own 30s (lib/queryClient.ts), not the library's 0 — under which
      // any reopen refetches whatever the modal's options say.
      client.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 } });
      await screen.findByText('Backend Engineer');
      const user = userEvent.setup();
      const openModal = async () => {
        await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);
        return within(await screen.findByRole('dialog'));
      };

      let modal = await openModal();
      await modal.findByText('Data Engineer');
      await user.click(modal.getByRole('button', { name: 'Close' }));

      await saveForLater(user, 'Backend Engineer');
      await waitFor(() =>
        expect(
          rowOf('Backend Engineer').getByText('Saved for later', { selector: '.tag' }),
        ).toBeInTheDocument(),
      );

      modal = await openModal();
      const row = within(modal.getByText('Backend Engineer').closest('tr') as HTMLElement);
      expect(await row.findByText('Saved for later')).toHaveClass('tag');
    });

    it('shows the statuses when the applications request fails', async () => {
      // First in the list, so the refusal shadows the fake's own /applications.
      mswServer.use(
        http.get('http://localhost:3000/api/v1/applications', () =>
          HttpResponse.json(null, { status: 500 }),
        ),
        ...buildHandlers(companyFixtures()),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      // That query only feeds the ⏳ mark; the status comes with the vacancy.
      expect(await modal.findAllByText('Not reviewed')).toHaveLength(2);
      expect(modal.queryByText(/load your applications/i)).not.toBeInTheDocument();
    });

    it('reports the server’s count when the page under it is short', async () => {
      // `limit=100` against 101 matching rows is the smallest case of what a big
      // employer's modal gets back: one page, under a count that says otherwise.
      mswServer.use(
        ...buildHandlers(
          Array.from({ length: 101 }, (_, i) =>
            vacancy({ id: i + 1, company: 'Acme', title: `Role ${i + 1}` }),
          ),
        ),
      );
      renderVacancies();
      // Role 101 first: the rows tie on recommendation and score, so `id desc` orders them.
      await screen.findByText('Role 101');

      const user = userEvent.setup();
      // Scoped to one row: a page-wide `getAllByRole` names every button in every
      // rendered row, ~1.5 s of this test in jsdom.
      const first = within(screen.getByText('Role 101').closest('tr') as HTMLElement);
      await user.click(first.getByRole('button', { name: /other vacancies at Acme/i }));

      const modal = within(await screen.findByRole('dialog'));
      // Both numbers, so the count under the button and the rows on screen can no
      // longer disagree silently ("101 in the log" was the page size, not the log).
      await modal.findByText('Showing 100 of 101 vacancies, newest first');
      // 101 fixtures is the honest minimum for a short page (the modal's own
      // `limit=100`), and jsdom paints all of them in two tables to get there.
    });

    it('marks a stale application with the tracker’s hourglass', async () => {
      mswServer.use(
        ...buildHandlers([
          vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
          // Off the default filter; the modal lists it all the same.
          vacancy({
            id: 2,
            company: 'Acme',
            title: 'Data Engineer',
            status: 'AWAITING',
            statusChangedAt: daysAgo(45),
          }),
        ]),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      const mark = await modal.findByText('⏳');
      // The same `.tip` bubble the action buttons wear, not a native `title`.
      expect(mark.querySelector('.tip')).toHaveTextContent('45 days since last update');
      expect(mark).not.toHaveAttribute('title');
    });

    it('shows — instead of a score for a vacancy with no usable applyURL', async () => {
      // An importer placeholder: the score belongs to a posting the app never saw.
      mswServer.use(
        ...buildHandlers([
          vacancy({ id: 1, company: 'Acme' }),
          vacancy({
            id: 2,
            company: 'Acme',
            title: 'Imported Role',
            applyUrl: 'tracker://import/2',
            // A row `ApplicationService` had to create has no analysis — so the dash
            // below comes from the missing analysis, not from the `tracker://` URL.
            matchScore: null,
            recommendation: null,
            estimationComment: null,
          }),
        ]),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      expect(modal.queryByText('80%')).toBeInTheDocument(); // the safe row keeps its pill
      expect(modal.getByText('Imported Role')).toBeInTheDocument();
      expect(modal.queryByRole('link', { name: 'Imported Role' })).not.toBeInTheDocument();
      // The importer row's score cell — not a page-wide count of dashes: the CV
      // column draws one on both rows, neither of them applied to.
      const imported = modal.getByText('Imported Role').closest('tr') as HTMLTableRowElement;
      expect(imported.cells[2]).toHaveTextContent('—');
    });

    it('fetches the company history when the modal opens, not with the list', async () => {
      const companyRequests: string[] = [];
      const onRequestStart = ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        if (url.pathname.endsWith('/vacancies') && url.searchParams.has('sameCompanyAs')) {
          companyRequests.push(url.search);
        }
      };
      mswServer.events.on('request:start', onRequestStart);
      try {
        mswServer.use(...buildHandlers(companyFixtures()));
        renderVacancies();
        await screen.findByText('Backend Engineer');
        expect(companyRequests).toEqual([]);

        const user = userEvent.setup();
        await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);
        await screen.findByRole('dialog');

        await waitFor(() => expect(companyRequests).toHaveLength(1));
        expect(companyRequests[0]).toContain('sameCompanyAs=Acme');
      } finally {
        mswServer.events.removeListener('request:start', onRequestStart);
      }
    });

    it('marks the row it was opened from, not the first one in the list', async () => {
      mswServer.use(...buildHandlers(companyFixtures()));
      renderVacancies();
      await screen.findByText('Backend Engineer');

      // The *second* Acme row (Backend Engineer — the rows tie on score, so `id desc`
      // puts #2 first): a modal that just marked its own first row, Data Engineer
      // (newest first, the same tie), would fail here.
      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[1]);

      const modal = within(await screen.findByRole('dialog'));
      const marked = modal.getByText('Current').closest('tr');
      expect(marked).toHaveClass('row-current');
      expect(within(marked as HTMLElement).getByText('Backend Engineer')).toBeInTheDocument();
      expect(modal.getAllByText('Current')).toHaveLength(1);
    });

    it('shows whether a tailored CV went with each application', async () => {
      mswServer.use(
        ...buildHandlers([
          vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
          vacancy({
            id: 2,
            company: 'Acme',
            title: 'Data Engineer',
            status: 'APPLIED',
            usedTailoredResume: true,
          }),
          vacancy({ id: 3, company: 'Acme', title: 'Frontend Lead', status: 'APPLIED' }),
        ]),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: /other vacancies at Acme/i }));
      const modal = within(await screen.findByRole('dialog'));
      // Date, Vacancy, Score, Status, CV, Actions.
      const cv = (title: string) =>
        (modal.getByText(title).closest('tr') as HTMLTableRowElement).cells[4];
      // The ✓ waits for the applications query, which lands after the rows.
      await waitFor(() => expect(cv('Data Engineer')).toHaveTextContent('✓'));
      expect(cv('Frontend Lead')).toHaveTextContent('—');
      expect(cv('Backend Engineer')).toHaveTextContent('—'); // never applied to
    });

    it('opens Details in a new tab, where the table opens it in place', async () => {
      mswServer.use(...buildHandlers(companyFixtures()));
      renderVacancies();
      await screen.findByText('Backend Engineer');
      // A modal's context would be lost to an in-place navigation; a table's is not.
      expect(
        rowOf('Backend Engineer').getByRole('link', { name: /open vacancy details/i }),
      ).not.toHaveAttribute('target');

      await userEvent
        .setup()
        .click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);
      const modal = within(await screen.findByRole('dialog'));
      await modal.findByText('Data Engineer');
      for (const link of modal.getAllByRole('link', { name: /open vacancy details/i })) {
        expect(link).toHaveAttribute('target', '_blank');
      }
    });

    it('scrolls the row it was opened from into view once, not on a refetch', async () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const rows = companyFixtures();
      mswServer.use(...buildHandlers(rows));
      const { client } = renderVacancies();
      await screen.findByText('Backend Engineer');

      // The second Acme row, Backend Engineer: not the modal's first row either.
      await userEvent
        .setup()
        .click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[1]);
      const modal = within(await screen.findByRole('dialog'));
      const current = modal.getByText('Current').closest('tr');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(current);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

      // Changed data, so the refetch really re-renders the row (an equal payload
      // keeps the old reference and renders nothing).
      rows[1].title = 'Data Engineer II';
      await client.refetchQueries({ queryKey: ['vacancy-company'] });
      await modal.findByText('Data Engineer II');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('caps its own height, so a long history still fits the viewport', async () => {
      mswServer.use(...buildHandlers(companyFixtures()));
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      // jsdom has no layout, so this asserts the box that does the capping rather
      // than a height — that the modal actually fits is the browser pass's check.
      const modal = within(await screen.findByRole('dialog'));
      expect(modal.getByRole('table').parentElement).toHaveClass('max-h-[60vh]', 'overflow-y-auto');
    });
  });

  describe('the action column', () => {
    it('labels each control with a short hover bubble instead of text', async () => {
      mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
      renderVacancies();
      await screen.findByText('Acme');

      // The controls are icons now, so the bubble is their only visible label.
      // Scoped by `.tip`: the Rec. column's tag also reads "Apply".
      const row = rowOf('Acme');
      for (const label of [
        'Copy',
        'Apply',
        'Decline',
        'Save for later',
        'Mark unavailable',
        'Details',
      ]) {
        expect(row.getByText(label, { selector: '.tip' })).toBeInTheDocument();
      }
    });

    it('sizes the column for six 30px buttons', async () => {
      mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
      renderVacancies();
      await screen.findByText('Acme');

      expect(screen.getByRole('columnheader', { name: 'Action' })).toHaveStyle({ width: '246px' });
    });

    it('swaps the copy bubble to Copied once the text is on the clipboard', async () => {
      mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
      renderVacancies();
      await screen.findByText('Acme');

      expect(rowOf('Acme').getByText('Copy', { selector: '.tip' })).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(rowOf('Acme').getByRole('button', { name: /^Copy / }));

      // Same bubble, the other half of the pair: "Copied" alone would pass even if
      // only the bubble's opacity changed.
      expect(rowOf('Acme').getByText('Copied', { selector: '.tip' })).toBeInTheDocument();
      expect(rowOf('Acme').queryByText('Copy', { selector: '.tip' })).not.toBeInTheDocument();
    });
  });
});
