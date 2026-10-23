import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Stats } from '@/lib/stats/types';
import { routeTree } from '@/router';
import {
  API_URL,
  buildHandlers,
  fakeStats,
  fakeVacancy,
  holdGet,
  statsHandler,
} from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import { expectLoadedPage, expectSkeletonPage } from '@/test/skeleton';

// The server counts (ADR-0031); what is left here is how the numbers are shown — the
// funnel's labels and conversions, the response rate — and that the review queue is
// asked of the server in its order.

function renderIndex() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
}

function renderDashboard(stats: Stats = fakeStats(), vacancies = [fakeVacancy()]) {
  mswServer.use(...buildHandlers(vacancies), statsHandler(stats));
  renderIndex();
}

/** Each funnel row's text: label, value, conversion. */
async function funnelRows() {
  await screen.findByRole('heading', { name: /pipeline funnel/i });
  return screen
    .getAllByTestId('funnel-row')
    .map((row) => Array.from(row.children).map((cell) => cell.textContent));
}

/** Each "Dropped out" row's text: label, value. */
async function droppedRows() {
  await screen.findByRole('heading', { name: /dropped out/i });
  return screen
    .getAllByTestId('fact-row')
    .map((row) => Array.from(row.children).map((cell) => cell.textContent));
}

describe('DashboardPage', () => {
  afterEach(() => {
    mswServer.events.removeAllListeners();
  });

  it('draws the funnel Logged → Interview, each stage against the one above', async () => {
    renderDashboard(
      fakeStats({ logged: 200, recommended: 150, applied: 30, responded: 10, interview: 4 }),
    );

    expect(await funnelRows()).toEqual([
      ['Logged', '', '200', 'baseline'],
      ['Recommended', '', '150', '75% of logged'],
      ['Applied', '', '30', '20% of recommended'],
      ['Got a response', '', '10', '33% of applied'],
      ['Interview', '', '4', '40% of got a response'],
    ]);
  });

  it('lists what dropped out under the funnel', async () => {
    // Not `logged − recommended`: that counted the 100 still awaiting analysis too.
    const stats = fakeStats({
      logged: 1248,
      awaitingAnalysis: 100,
      recommended: 524,
      notRecommended: 624,
      declined: 40,
      unavailable: 12,
    });
    stats.pipeline.byStatus.REJECTED = 90;
    stats.pipeline.timedOut = 70;
    renderDashboard(stats);

    expect(await droppedRows()).toEqual([
      ['Not recommended by the analyzer', '624'],
      ['Declined by you', '40'],
      ['No longer accepting applications', '12'],
      ['Rejected', '90'],
      ['Timed out (no move for 30+ days)', '70'],
    ]);
  });

  it('shows how many vacancies await their analysis', async () => {
    renderDashboard(fakeStats({ logged: 30, awaitingAnalysis: 12 }));

    await screen.findByText('Awaiting analysis');
    const tile = screen
      .getAllByTestId('kpi-tile')
      .find((t) => within(t).queryByText('Awaiting analysis'));
    expect(tile).toHaveTextContent('12');
    expect(tile).toHaveTextContent('in the inbox, not yet scored');
  });

  it('shows a dash, not NaN or Infinity, below an empty stage', async () => {
    renderDashboard(fakeStats({ logged: 5 }));

    const rows = await funnelRows();
    expect(rows[1][3]).toBe('0% of logged');
    expect(rows[2][3]).toBe('—');
  });

  it('shows a response rate of 0 before the first application', async () => {
    renderDashboard();
    expect(await screen.findByText('0% response rate')).toBeInTheDocument();
  });

  it('rounds the response rate to one decimal', async () => {
    renderDashboard(fakeStats({ applied: 3, responded: 1, actionNeeded: 1 }));
    expect(await screen.findByText('33.3% response rate')).toBeInTheDocument();
    expect(screen.getByText('1 need your reply')).toBeInTheDocument();
  });

  it('asks the server for the top ten untriaged, recommended first, and keeps its order', async () => {
    const requests: URLSearchParams[] = [];
    mswServer.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/vacancies')) requests.push(url.searchParams);
    });
    renderDashboard(fakeStats(), [
      fakeVacancy({ id: 1, title: 'Skip me', recommendation: 'SKIP', matchScore: 99 }),
      fakeVacancy({ id: 2, title: 'Apply me', recommendation: 'APPLY', matchScore: 70 }),
      fakeVacancy({ id: 3, title: 'Triaged', status: 'DECLINED', matchScore: 100 }),
    ]);

    await screen.findByText('Apply me');
    // Each Review link is named "Review <title>".
    const titles = within(screen.getByRole('list', { name: 'Needs your review' }))
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));
    expect(titles).toEqual(['Review Apply me', 'Review Skip me']);
    expect(requests.map((q) => Object.fromEntries(q))).toEqual([
      { status: 'NOT_REVIEWED', sort: 'recommended', limit: '10' },
    ]);
  });

  it('lists ten of a longer queue', async () => {
    // Ten fill the funnel card's height on a desktop; the card scrolls past that.
    renderDashboard(
      fakeStats(),
      Array.from({ length: 12 }, (_, i) => fakeVacancy({ id: i + 1, title: `Role ${i + 1}` })),
    );

    await screen.findByText('Role 12');
    const queue = screen.getByRole('list', { name: 'Needs your review' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(10);
  });

  it('lists recent moves from the stats', async () => {
    renderDashboard(
      fakeStats({
        recent: [
          {
            id: 9,
            vacancyId: 1,
            status: 'INTERVIEW',
            createdAt: new Date().toISOString(),
            company: 'Acme',
            title: 'Backend Engineer',
          },
        ],
      }),
      [],
    );

    expect(await screen.findByText('Interview scheduled — Acme')).toBeInTheDocument();
    // The title leads to the vacancy's page.
    expect(screen.getByRole('link', { name: 'Backend Engineer' })).toHaveAttribute(
      'href',
      '/vacancies/1',
    );
    const activity = screen.getByRole('list', { name: 'Recent activity' });
    expect(within(activity).getByRole('listitem')).toHaveTextContent(
      'Backend Engineer · Interview',
    );
  });

  it('draws skeleton tiles while it loads, the numbers after', async () => {
    const hold = holdGet('/stats');
    mswServer.use(hold.handler, ...buildHandlers([fakeVacancy()]), statsHandler(fakeStats()));
    renderIndex();

    const page = await expectSkeletonPage();
    const tiles = within(page).getAllByTestId('kpi-tile').length;
    hold.release();

    expect(await screen.findByRole('heading', { name: /pipeline funnel/i })).toBeInTheDocument();
    expectLoadedPage();
    // A skeleton for each tile the page draws, so a new one is not missed. The cards'
    // shapes are the visual tests' to compare.
    expect(screen.getAllByTestId('kpi-tile')).toHaveLength(tiles);
  });

  it('surfaces a load error instead of throwing', async () => {
    mswServer.use(
      http.get(`${API_URL}/stats`, () => HttpResponse.json(null, { status: 500 })),
      ...buildHandlers([]),
    );
    renderIndex();

    expect(
      await screen.findByText(/failed to load the dashboard: .*HTTP 500/i),
    ).toBeInTheDocument();
  });
});
