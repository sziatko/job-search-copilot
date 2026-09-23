import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { ApplicationListItem } from '@/pages/applications/types';
import { routeTree } from '@/router';
import { buildApplicationHandlers, buildHandlers } from '@/test/msw/handlers';
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
            statusComment: null,
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
      // One dash, for the importer row's score — the safe row shows a pill, and
      // both Action cells say "Not applied" once the log has loaded.
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
