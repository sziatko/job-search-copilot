import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { timeAgo } from './DashboardPage';
import type { Stats } from './types';

// The server counts (ADR-0031); what is left here is how the numbers are shown — the
// funnel's labels and conversions, the response rate — and that the review queue is
// asked of the server in its order.
const NOW = new Date('2026-09-21T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

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
  return Array.from(document.querySelectorAll('.funnel-row')).map((row) =>
    Array.from(row.children).map((cell) => cell.textContent),
  );
}

/** Each "Dropped out" row's text: label, value. */
async function droppedRows() {
  await screen.findByRole('heading', { name: /dropped out/i });
  return Array.from(document.querySelectorAll('.fact-row')).map((row) =>
    Array.from(row.children).map((cell) => cell.textContent),
  );
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
    const stats = fakeStats({ logged: 1248, recommended: 524, declined: 40, unavailable: 12 });
    stats.pipeline.byStatus.REJECTED = 90;
    stats.pipeline.timedOut = 70;
    renderDashboard(stats);

    expect(await droppedRows()).toEqual([
      ['Not recommended by the analyzer', '724'],
      ['Declined by you', '40'],
      ['No longer accepting applications', '12'],
      ['Rejected', '90'],
      ['Timed out (no move for 30+ days)', '70'],
    ]);
  });

  it('floors "not recommended" at 0 when more are recommended than logged', async () => {
    // A vacancy saved without a log check (ADR-0026) is recommended but never logged.
    renderDashboard(fakeStats({ logged: 3, recommended: 5 }));

    expect((await droppedRows())[0]).toEqual(['Not recommended by the analyzer', '0']);
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
    renderDashboard(fakeStats({ applied: 3, responded: 1, recruiterScreen: 1 }));
    expect(await screen.findByText('33.3% response rate')).toBeInTheDocument();
    expect(screen.getByText('1 in recruiter screen')).toBeInTheDocument();
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
    const titles = Array.from(document.querySelectorAll('.attn-title')).map((t) => t.textContent);
    expect(titles).toEqual(['Apply me', 'Skip me']);
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
    expect(document.querySelectorAll('.review-scroll .attn-item')).toHaveLength(10);
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
    expect(document.querySelector('.activity-sub')).toHaveTextContent(
      'Backend Engineer · Interview',
    );
  });

  it('draws skeleton tiles and cards while it loads, the numbers after', async () => {
    const hold = holdGet('/stats');
    mswServer.use(hold.handler, ...buildHandlers([fakeVacancy()]), statsHandler(fakeStats()));
    renderIndex();

    const page = await expectSkeletonPage();
    const tiles = page.querySelectorAll('.kpi-tile').length;
    const cards = page.querySelectorAll('.card').length;
    hold.release();

    expect(await screen.findByRole('heading', { name: /pipeline funnel/i })).toBeInTheDocument();
    expectLoadedPage();
    // A skeleton for each tile and card the page draws, so a new one is not missed.
    expect(document.querySelectorAll('.kpi-tile')).toHaveLength(tiles);
    expect(document.querySelectorAll('.card')).toHaveLength(cards);
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

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads minutes below an hour, hours below a day, days above', () => {
    expect(timeAgo(NOW.toISOString())).toBe('this minute');
    expect(timeAgo(daysAgo(5 / (24 * 60)))).toBe('5 minutes ago');
    expect(timeAgo(daysAgo(90 / (24 * 60)))).toBe('2 hours ago');
    expect(timeAgo(daysAgo(3))).toBe('3 days ago');
  });

  it('fails open on an unparseable timestamp instead of throwing', () => {
    // `Intl.RelativeTimeFormat.format(NaN, …)` throws `RangeError`, and NaN passes
    // every `<` comparison, so without the guard this reaches format() — and with no
    // `errorComponent` in the router, one bad stamp would take the whole dashboard
    // render with it. The tracker's `daysSinceLastMove` fails open the same way.
    expect(timeAgo('garbage')).toBe('unknown');
    expect(timeAgo('')).toBe('unknown');
  });

  it('clamps a future timestamp to "this minute" rather than a negative number', () => {
    // Server and browser clocks disagree; the row is stamped by the server, so a
    // browser a little behind will see a timestamp in its own future. Without the
    // clamp this renders "in 60 minutes" for something that already happened.
    const oneHourAhead = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect(timeAgo(oneHourAhead)).toBe('this minute');
  });
});
