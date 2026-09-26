import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationListItem } from '@/pages/applications/types';
import { routeTree } from '@/router';
import {
  buildApplicationHandlers,
  buildHandlers,
  estimatedVacanciesResolver,
} from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import type { EstimatedVacancyListItem } from './types';

function vacancy(overrides: Partial<EstimatedVacancyListItem> = {}): EstimatedVacancyListItem {
  return {
    id: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/1',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    userAction: 'NOT_REVIEWED',
    userActionUpdatedAt: null,
    ...overrides,
  };
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

/** The modal joins this into the tracker's log by `estimatedVacancyId`. */
function application(overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  const applied = daysAgo(10);
  return {
    id: 1,
    appliedAt: applied,
    status: 'APPLIED',
    statusUpdatedAt: applied,
    comments: [],
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

/**
 * Page-level, not `renderHook`: the search term lives in the route's search
 * params, so `useVacancies` calls `useSearch` and throws without a router above
 * it. Same shape as `renderTracker` in the tracker's test.
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

/** The ⋯ menu's items. The popover is inside the row, so this scopes to it too —
 * and while the menu is closed it is `display: none`, hence invisible to queries. */
function menuItem(name: string) {
  return within(screen.getByRole('menu')).getByRole('menuitem', { name });
}

const SEARCH_BOX = /search company or role/i;

// The toast spies below are file-scoped: a spy that outlives the test it belongs
// to makes the next one's assertion meaningless.
afterEach(() => vi.restoreAllMocks());

describe('VacanciesPage / useVacancies', () => {
  it('defaults to the NOT_REVIEWED filter and hides everything else', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Declined Co', userAction: 'DECLINED' }),
        vacancy({ id: 3, company: 'Applied Co', userAction: 'APPLIED' }),
      ]),
    );
    renderVacancies();

    await screen.findByText('Acme');
    expect(screen.queryByText('Declined Co')).not.toBeInTheDocument();
    expect(screen.queryByText('Applied Co')).not.toBeInTheDocument();
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

  it('sends the typed term to the server as `search` and renders the matches', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
        vacancy({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Backend Engineer');

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(SEARCH_BOX), 'beta');

    // The MSW handler filters on `search` the way the real endpoint does, so this
    // can only pass if the term left the browser — a client-side-only filter
    // would leave `search` unset and both rows would still be there.
    await waitFor(() => expect(screen.queryByText('Backend Engineer')).not.toBeInTheDocument());
    await screen.findByText('Frontend Lead');
  });

  it('takes the initial term from the URL', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
        vacancy({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
      ]),
    );
    renderVacancies('/vacancies?q=beta');

    // The router paints nothing until it has resolved, so this has to wait too.
    expect(await screen.findByPlaceholderText(SEARCH_BOX)).toHaveValue('beta');
    await screen.findByText('Frontend Lead');
    expect(screen.queryByText('Backend Engineer')).not.toBeInTheDocument();
  });

  it('sends a padded term to the server trimmed, leaving the box as typed', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
        vacancy({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Backend Engineer');

    const box = screen.getByPlaceholderText(SEARCH_BOX);
    await userEvent.setup().type(box, '  beta  ');

    // The handler matches on the term exactly as it arrives, so an untrimmed
    // '  beta  ' matches nothing and both rows stay on screen.
    await waitFor(() => expect(screen.queryByText('Backend Engineer')).not.toBeInTheDocument());
    await screen.findByText('Frontend Lead');
    // ...and the box keeps what was typed: trimming before the URL is written
    // would make a space untypeable mid-word.
    expect(box).toHaveValue('  beta  ');
  });

  it('shows one title and puts the count in the footer', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Acme', title: 'Data Engineer' }),
        vacancy({ id: 3, company: 'Beta Corp', userAction: 'DECLINED' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Backend Engineer');

    // The title belongs to the shell's <h1>; the card used to repeat it as an <h2>.
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Analyzed vacancies' }),
    ).not.toBeInTheDocument();
    // 2 of 3: the status filter is client-side, so `total` (the server's match
    // count for the term) and the rows on screen are deliberately different numbers.
    expect(
      screen.getByText('Showing 2 of 3 vacancies · scores from the vacancy-evaluator skill'),
    ).toBeInTheDocument();
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
          matchScore: 0,
          estimationComment: 'N/A',
        }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Backend Engineer');

    // Scoped by title, since both rows share a company and `rowOf` matches any text
    // in the row. Before this step the placeholder rendered a real-looking `0%`.
    const imported = rowOf('Imported Role');
    expect(imported.queryByText('0%')).not.toBeInTheDocument();
    expect(imported.getByText('—')).toBeInTheDocument();
    // …and the analysed row keeps its pill: the dash is about the analysis, not
    // about the row being an import or its link being unusable.
    expect(rowOf('Backend Engineer').getByText('80%')).toBeInTheDocument();
  });

  it('shows the current status as a tag', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme', userAction: 'READY_TO_APPLY' }),
        vacancy({ id: 2, company: 'Beta Corp', userAction: 'DECLINED' }),
      ]),
    );
    renderVacancies();
    // Neither row is NOT_REVIEWED, so the default filter starts on the empty state.
    await screen.findByText(/no vacancies match this filter/i);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');

    // Scoped by `.tag`: the ⋯ menu holds the same wording, and it stays in the DOM
    // (hidden) whether or not it is open.
    expect(rowOf('Acme').getByText('Ready to apply', { selector: '.tag' })).toBeInTheDocument();
    expect(rowOf('Beta Corp').getByText('Declined', { selector: '.tag' })).toBeInTheDocument();
  });

  it('saves a status picked from the ⋯ menu straight away, with no dialog', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'More statuses' }));
    await user.click(menuItem('Ready to apply'));

    // NOT_REVIEWED filter still active -> nothing to confirm, the row just drops out.
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
  });

  it('sets a reviewed row back to Not reviewed from the ⋯ menu', async () => {
    mswServer.use(
      ...buildHandlers([vacancy({ id: 1, company: 'Acme', userAction: 'READY_TO_APPLY' })]),
    );
    renderVacancies();
    // The one row is READY_TO_APPLY, so the default filter starts on the empty state.
    await screen.findByText(/no vacancies match this filter/i);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    expect(rowOf('Acme').getByText('Ready to apply', { selector: '.tag' })).toBeInTheDocument();

    await user.click(rowOf('Acme').getByRole('button', { name: 'More statuses' }));
    await user.click(menuItem('Not reviewed'));

    await waitFor(() =>
      expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument(),
    );
  });

  it('closes the ⋯ menu on a second click of its own trigger', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    renderVacancies();
    await screen.findByText('Acme');

    const trigger = rowOf('Acme').getByRole('button', { name: 'More statuses' });
    const user = userEvent.setup();
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    // The trigger is a declarative invoker, so the browser's activation behaviour
    // owns hide as well as show. A click handler could never do this: the menu is
    // already closed by the time one runs (light dismiss is on pointerup).
    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // …and it still opens on a third click.
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('measures the menu on every open, not once', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    renderVacancies();
    await screen.findByText('Acme');

    // The trigger moves between opens — a row above it grows, the list scrolls —
    // so a position computed once and reused points at nothing. jsdom's rect stub
    // returns a fixed box (`bottom: 768`, `right: 1024`, window 1024 wide); this one
    // is moved, which is what makes a cached position visible.
    const trigger = rowOf('Acme').getByRole('button', { name: 'More statuses' });
    trigger.getBoundingClientRect = () => ({ bottom: 100, right: 400 }) as DOMRect;

    const user = userEvent.setup();
    await user.click(trigger);
    await screen.findByRole('menu');
    const menu = document.querySelector<HTMLElement>('.row-menu');
    expect(menu?.style.top).toBe('104px'); // trigger.bottom + 4
    expect(menu?.style.right).toBe('624px'); // innerWidth 1024 - trigger.right
  });

  it('opens only the menu of the row that was clicked', async () => {
    mswServer.use(
      ...buildHandlers([
        vacancy({ id: 1, company: 'Acme' }),
        vacancy({ id: 2, company: 'Beta Corp' }),
        vacancy({ id: 3, company: 'Gamma' }),
      ]),
    );
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Beta Corp').getByRole('button', { name: 'More statuses' }));

    // The invoker resolves its target by id, and the id is per instance — with one
    // shared id every row would open the same menu.
    const open = document.querySelectorAll('.row-menu.popover-open');
    expect(open).toHaveLength(1);
    const trigger = rowOf('Beta Corp').getByRole('button', { name: 'More statuses' });
    expect(open[0].id).toBe(trigger.getAttribute('popovertarget'));
  });

  it('disables every control in a row while its save is in flight', async () => {
    const items = [vacancy({ id: 1, company: 'Acme' })];
    mswServer.use(...buildHandlers(items));
    // A slow PATCH, so the in-flight state is observable rather than a race.
    mswServer.use(
      http.patch('http://localhost:3000/api/v1/estimated-vacancies/:id/user-action', async () => {
        await delay(300);
        items[0].userAction = 'READY_TO_APPLY';
        return HttpResponse.json(items[0]);
      }),
    );
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    await user.click(rowOf('Acme').getByRole('button', { name: 'More statuses' }));
    await user.click(menuItem('Ready to apply'));

    // All four in one `waitFor`: they come from the same `saving` flag, so they
    // have to agree on a single render — checking them one at a time can catch the
    // first disabled and the second already back.
    await waitFor(() => {
      expect(rowOf('Acme').getByRole('button', { name: 'Apply' })).toBeDisabled();
      expect(rowOf('Acme').getByRole('button', { name: 'Decline' })).toBeDisabled();
      expect(rowOf('Acme').getByRole('button', { name: 'More statuses' })).toBeDisabled();
      expect(rowOf('Acme').getByRole('button', { name: /^Copy / })).toBeDisabled();
    });

    await waitFor(() =>
      expect(rowOf('Acme').getByText('Ready to apply', { selector: '.tag' })).toBeInTheDocument(),
    );
  });

  it('requires confirmation before persisting DECLINED', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'Decline' }));

    expect(screen.getByText('Decline this vacancy?')).toBeInTheDocument();
    // Nothing saved yet — the row is still listed.
    expect(screen.getByText('Acme')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, decline' }));
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
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
        // The real POST flips the vacancy's userAction in the same transaction
        // (ADR-0019), so the fake has to as well or the refetch after the mutation
        // puts the row straight back.
        items[0].userAction = 'APPLIED';
        const now = new Date().toISOString();
        return HttpResponse.json({
          application: {
            id: 1,
            appliedAt: now,
            status: 'APPLIED',
            statusUpdatedAt: now,
            comments: [],
            salaryInListing: '130 PLN/h',
            usedTailoredResume: true,
            userComment: 'Adapted CV.',
            createdAt: now,
            updatedAt: now,
            estimatedVacancyId: 1,
            company: 'Acme',
            title: 'Backend Engineer',
            applyUrl: 'https://example.com/1',
            matchScore: 80,
            recommendation: 'APPLY',
            estimationComment: 'Strong match.',
          },
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

    await user.type(screen.getByLabelText('Salary / rate in the listing'), '130 PLN/h');
    await user.click(screen.getByLabelText('Used a tailored resume'));
    await user.type(screen.getByLabelText('Comment'), 'Adapted CV.');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() =>
      expect(recorded).toMatchObject({
        estimatedVacancyId: 1,
        salaryInListing: '130 PLN/h',
        usedTailoredResume: true,
        userComment: 'Adapted CV.',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    // The other half of finding 1: a successful apply still says so. Against the
    // spy, because the Toaster lives in main.tsx, outside the route tree.
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
              error: 'ApplicationAlreadyExistsError',
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
      expect(success).not.toHaveBeenCalled();
    } finally {
      success.mockRestore();
    }
  });

  /**
   * Holds the list request for one term open until the test releases it, so a test
   * can act inside the window finding 3 lives in: `keepPreviousData` is showing the
   * *older* term's page, and the term being typed has no cache entry yet.
   *
   * The handler answers the held request itself rather than delegating — MSW's
   * `passthrough()` is not "try the next handler", it is "make the **real** request",
   * which here would hit the dev API on :3000 and fill the test with real vacancies.
   */
  /** A promise a test releases by hand — one held request, no timer to race. */
  function gate() {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { held, release: () => release() };
  }

  function holdTermRequest(term: string, items: EstimatedVacancyListItem[]) {
    const held = gate();
    const state = { started: 0, release: held.release };
    // Everything but the held term goes straight to the shared fake. The wrapper
    // must answer *every* list request, so delegating is what keeps it honest —
    // and it makes handler order irrelevant.
    const serve = estimatedVacanciesResolver(items);
    const handler = http.get('http://localhost:3000/api/v1/estimated-vacancies', async (info) => {
      if (new URL(info.request.url).searchParams.get('search') !== term) {
        return serve(info);
      }
      state.started += 1;
      await held.held;
      return serve(info);
    });
    return { handler, state };
  }

  it('writes an action into the cached page that exists while a term loads', async () => {
    const items = [vacancy({ id: 1, company: 'Acme' }), vacancy({ id: 2, company: 'Beta Corp' })];
    const gate = holdTermRequest('beta', items);
    mswServer.use(gate.handler, ...buildHandlers(items));
    const { client } = renderVacancies();
    await screen.findByText('Acme');

    // The status filter is client-side, and this row's status changes below: under
    // NOT_REVIEWED it would leave the view before anything could be read.
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');

    await user.type(screen.getByPlaceholderText(SEARCH_BOX), 'beta');
    await waitFor(() => expect(gate.state.started).toBe(1));
    // The window finding 3 lives in: the term being typed has no cache entry, and
    // the rows on screen are the *older* term's page, held by `keepPreviousData`.
    expect(client.getQueryData(['vacancies', 'beta'])).toBeUndefined();

    await user.click(rowOf('Acme').getByRole('button', { name: 'More statuses' }));
    await user.click(menuItem('Ready to apply'));

    // The optimistic write lands on the entry that exists — the exact-key write it
    // replaced hit the absent one and did nothing. Asserted on the cache, not the
    // screen: the screen cannot show it either way, because `keepPreviousData`
    // freezes the placeholder to the result it first produced and never re-reads the
    // entry underneath (see the comment in useVacancies.ts).
    await waitFor(() =>
      expect(
        client.getQueryData<{ items: EstimatedVacancyListItem[] }>(['vacancies', ''])?.items[0]
          .userAction,
      ).toBe('READY_TO_APPLY'),
    );
    expect(client.getQueryData(['vacancies', 'beta'])).toBeUndefined();
    // …and the frozen page is still what is on screen, unchanged.
    expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument();

    gate.state.release();
  });

  it('restores the cached page it wrote when the save fails mid-search', async () => {
    const items = [vacancy({ id: 1, company: 'Acme' }), vacancy({ id: 2, company: 'Beta Corp' })];
    const list = holdTermRequest('beta', items);
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
      http.patch('http://localhost:3000/api/v1/estimated-vacancies/:id/user-action', async () => {
        patchState.started += 1;
        await patch.held;
        return HttpResponse.json(null, { status: 500 });
      }),
    );
    const { client } = renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    await user.type(screen.getByPlaceholderText(SEARCH_BOX), 'beta');
    await waitFor(() => expect(list.state.started).toBe(1));

    await user.click(rowOf('Acme').getByRole('button', { name: 'More statuses' }));
    await user.click(menuItem('Ready to apply'));

    // Mid-flight: the optimistic write is *in* the cached page, which is what makes
    // the rollback below a real rollback rather than a no-op on an untouched entry.
    await waitFor(() => expect(patchState.started).toBe(1));
    const cached = () =>
      client.getQueryData<{ items: EstimatedVacancyListItem[] }>(['vacancies', ''])?.items[0]
        .userAction;
    expect(cached()).toBe('READY_TO_APPLY');

    // Now let it fail: the row says so, and the page it wrote is back to what it held.
    patch.release();
    await screen.findByText(/Failed to update vacancy 1/);
    expect(cached()).toBe('NOT_REVIEWED');
    expect(client.getQueryData(['vacancies', 'beta'])).toBeUndefined();

    list.state.release();
  });

  it('surfaces a row error and rolls the row back when the save fails', async () => {
    mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
    mswServer.use(
      http.patch('http://localhost:3000/api/v1/estimated-vacancies/:id/user-action', () =>
        HttpResponse.json(null, { status: 500 }),
      ),
    );
    renderVacancies();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.click(rowOf('Acme').getByRole('button', { name: 'More statuses' }));
    await user.click(menuItem('Ready to apply'));

    // The optimistic write put the row out of the NOT_REVIEWED view; the rollback
    // has to bring it back, tag and all.
    await screen.findByText(/Failed to update vacancy 1/);
    expect(rowOf('Acme').getByText('Not reviewed', { selector: '.tag' })).toBeInTheDocument();
  });

  it('surfaces a friendly loadError when the list response has the wrong shape', async () => {
    mswServer.use(
      http.get('http://localhost:3000/api/v1/estimated-vacancies', () =>
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

      // The sentence is a `.tip` bubble like the Action column's, not the native
      // `title` it used to be — the count alone is what the button shows.
      expect(buttons[0].querySelector('.tip')).toHaveTextContent('1 other vacancy at Acme');
      expect(buttons[0]).not.toHaveAttribute('title');
      // Exact, so it fails if the count stops being hidden: that name would then
      // read "1 1 other vacancy at Acme", which the regex above still matches.
      expect(buttons[0]).toHaveAccessibleName('1 other vacancy at Acme');
    });

    it('lists every vacancy of that company, with its applied state', async () => {
      mswServer.use(
        ...buildHandlers(companyFixtures()),
        ...buildApplicationHandlers([
          application({ id: 7, estimatedVacancyId: 2, company: 'Acme', title: 'Data Engineer' }),
        ]),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      expect(modal.getByText('All vacancies at Acme')).toBeInTheDocument();
      expect(modal.getByText('Backend Engineer')).toBeInTheDocument();
      expect(modal.getByText('Data Engineer')).toBeInTheDocument();
      expect(modal.queryByText('Frontend Lead')).not.toBeInTheDocument();
      expect(modal.getByRole('columnheader', { name: 'Action' })).toBeInTheDocument();
      // Only #2 has an application in the log. The column reads "—" until the log
      // has loaded, so this waits rather than asserting on the first paint.
      await waitFor(() => expect(modal.getByText('Applied')).toBeInTheDocument());
      expect(modal.getByText('Not applied')).toBeInTheDocument();
    });

    it('claims nothing about the log when the applications request fails', async () => {
      mswServer.use(
        ...buildHandlers(companyFixtures()),
        http.get('http://localhost:3000/api/v1/applications', () =>
          HttpResponse.json(null, { status: 500 }),
        ),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      // Wait for the failure itself: until then the cells are dashed for being
      // pending, which is the same paint for the opposite reason.
      await modal.findByText(/load your applications/i);
      // Both Acme rows. A failed log is not an empty one, and "Not applied" is the
      // claim a stopped API used to make for every row here.
      expect(modal.getAllByText('—')).toHaveLength(2);
      expect(modal.queryByText('Not applied')).not.toBeInTheDocument();
      expect(modal.queryByText('Applied')).not.toBeInTheDocument();
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
      await screen.findByText('Role 1');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancies at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      // Both numbers, so the count under the button and the rows on screen can no
      // longer disagree silently ("101 in the log" was the page size, not the log).
      await modal.findByText('Showing 100 of 101 vacancies, newest first');
      // 101 fixtures is the honest minimum for a short page (the modal's own
      // `limit=100`), and jsdom paints all of them in two tables to get there.
    }, 20_000);

    it('marks a stale application with the tracker’s hourglass', async () => {
      mswServer.use(
        ...buildHandlers([
          vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
          vacancy({ id: 2, company: 'Acme', title: 'Data Engineer' }),
        ]),
        ...buildApplicationHandlers([
          application({
            id: 7,
            estimatedVacancyId: 1,
            status: 'REPLIED',
            appliedAt: daysAgo(45),
            statusUpdatedAt: daysAgo(45),
          }),
        ]),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      const mark = modal.getByText('⏳');
      // The same `.tip` bubble the action buttons wear, not the native `title` it
      // used to carry.
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
            // The placeholder sentinel `ApplicationService` writes for a row it had
            // to create. Without it this fixture claimed a real analysis while
            // carrying a `tracker://` URL — the dash below passed for the wrong
            // reason (the URL scheme), which is what step 7 separates.
            estimationComment: 'N/A',
          }),
        ]),
        // An empty log, served: without a handler here the request is unhandled
        // (`onUnhandledRequest: 'error'`), the Action cells read `—` for a reason
        // this test is not about, and the dash count below would be measuring the
        // failed fetch instead of the importer row's score.
        ...buildApplicationHandlers([]),
      );
      renderVacancies();
      await screen.findByText('Backend Engineer');

      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);

      const modal = within(await screen.findByRole('dialog'));
      expect(modal.queryByText('80%')).toBeInTheDocument(); // the safe row keeps its pill
      expect(modal.getByText('Imported Role')).toBeInTheDocument();
      expect(modal.queryByRole('link', { name: 'Imported Role' })).not.toBeInTheDocument();
      // One dash, for the importer row's score — the safe row shows a pill, and
      // both Action cells say "Not applied" now that the log has loaded.
      await waitFor(() => expect(modal.getAllByText('—')).toHaveLength(1));
      expect(modal.getAllByText('Not applied')).toHaveLength(2);
    });

    it('fetches the company history when the modal opens, not with the list', async () => {
      const companyRequests: string[] = [];
      const onRequestStart = ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has('company')) companyRequests.push(url.search);
      };
      mswServer.events.on('request:start', onRequestStart);
      try {
        mswServer.use(...buildHandlers(companyFixtures()), ...buildApplicationHandlers([]));
        renderVacancies();
        await screen.findByText('Backend Engineer');
        expect(companyRequests).toEqual([]);

        const user = userEvent.setup();
        await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[0]);
        await screen.findByRole('dialog');

        await waitFor(() => expect(companyRequests).toHaveLength(1));
        expect(companyRequests[0]).toContain('company=Acme');
      } finally {
        mswServer.events.removeListener('request:start', onRequestStart);
      }
    });

    it('marks the row it was opened from, not the first one in the list', async () => {
      mswServer.use(...buildHandlers(companyFixtures()));
      renderVacancies();
      await screen.findByText('Backend Engineer');

      // The *second* Acme row: a modal that just marked its own first row would
      // pass against the first row's button and fail here.
      const user = userEvent.setup();
      await user.click(screen.getAllByRole('button', { name: /other vacancy at Acme/i })[1]);

      const modal = within(await screen.findByRole('dialog'));
      const marked = modal.getByText('Current').closest('tr');
      expect(marked).toHaveClass('row-current');
      expect(within(marked as HTMLElement).getByText('Data Engineer')).toBeInTheDocument();
      expect(modal.getAllByText('Current')).toHaveLength(1);
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
      for (const label of ['Copy', 'Apply', 'Decline', 'More']) {
        expect(row.getByText(label, { selector: '.tip' })).toBeInTheDocument();
      }
    });

    it('sizes the column for four 30px buttons', async () => {
      mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
      renderVacancies();
      await screen.findByText('Acme');

      expect(screen.getByRole('columnheader', { name: 'Action' })).toHaveStyle({ width: '180px' });
    });

    it('swaps the copy bubble to Copied once the text is on the clipboard', async () => {
      mswServer.use(...buildHandlers([vacancy({ id: 1, company: 'Acme' })]));
      renderVacancies();
      await screen.findByText('Acme');

      expect(rowOf('Acme').getByText('Copy', { selector: '.tip' })).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(rowOf('Acme').getByRole('button', { name: /^Copy / }));

      // Same bubble, the other half of the pair: the old flag was always
      // "Copied" and only its opacity changed, so it proves nothing on its own.
      expect(rowOf('Acme').getByText('Copied', { selector: '.tip' })).toBeInTheDocument();
      expect(rowOf('Acme').queryByText('Copy', { selector: '.tip' })).not.toBeInTheDocument();
    });
  });
});
