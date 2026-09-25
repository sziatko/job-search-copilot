import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApplicationHandlers, buildHandlers } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import type { ApplicationListItem } from '../applications/types';
import type { EstimatedVacancyListItem } from '../vacancies/types';
import { timeAgo } from './DashboardPage';
import { useDashboard } from './useDashboard';

// Every number on the landing page is computed here from two queries, so this is
// where a wrong figure would be silently wrong — nothing downstream re-checks it.
const NOW = new Date('2026-09-21T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function withQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function application(overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return {
    id: 1,
    appliedAt: NOW.toISOString(),
    status: 'APPLIED',
    statusUpdatedAt: NOW.toISOString(),
    statusComment: null,
    salaryInListing: null,
    usedTailoredResume: false,
    userComment: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    estimatedVacancyId: 1,
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://acme.com/jobs/1',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    ...overrides,
  };
}

function vacancy(overrides: Partial<EstimatedVacancyListItem> = {}): EstimatedVacancyListItem {
  return {
    id: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://acme.com/jobs/1',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    userAction: 'NOT_REVIEWED',
    userActionUpdatedAt: null,
    ...overrides,
  };
}

async function setUp(
  options: { applications?: ApplicationListItem[]; vacancies?: EstimatedVacancyListItem[] } = {},
) {
  mswServer.use(
    ...buildApplicationHandlers(options.applications ?? []),
    ...buildHandlers(options.vacancies ?? []),
  );
  const view = renderHook(() => useDashboard(), { wrapper: withQueryClient() });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useDashboard', () => {
  describe('the response rate', () => {
    it('is 0, not NaN, when nothing has been sent', async () => {
      // 0/0 is the classic way a landing page renders "NaN%".
      const view = await setUp();

      expect(view.result.current.metrics.sent).toBe(0);
      expect(view.result.current.metrics.responseRate).toBe(0);
    });

    it('rounds to one decimal', async () => {
      const view = await setUp({
        applications: [
          application({ id: 1, status: 'REPLIED' }),
          application({ id: 2, status: 'APPLIED' }),
          application({ id: 3, status: 'APPLIED' }),
        ],
      });

      expect(view.result.current.metrics.responseRate).toBe(33.3);
    });
  });

  describe('the funnel counters', () => {
    it('counts a reply from any stage past the first, and a rejection as neither', async () => {
      const view = await setUp({
        applications: [
          application({ id: 1, status: 'REPLIED' }),
          application({ id: 2, status: 'RECRUITER_SCREEN' }),
          application({ id: 3, status: 'INTERVIEW' }),
          application({ id: 4, status: 'OFFER' }),
          application({ id: 5, status: 'APPLIED' }),
          application({ id: 6, status: 'REJECTED' }),
        ],
      });

      const { sent, responded, interview, recruiterScreen } = view.result.current.metrics;
      expect(sent).toBe(6);
      expect(responded).toBe(4); // REPLIED + RECRUITER_SCREEN + INTERVIEW + OFFER
      expect(interview).toBe(2); // INTERVIEW + OFFER
      expect(recruiterScreen).toBe(1);
    });
  });

  describe('the review queue', () => {
    it('ranks by score and caps at five, ignoring anything already triaged', async () => {
      const view = await setUp({
        vacancies: [
          vacancy({ id: 1, matchScore: 40 }),
          vacancy({ id: 2, matchScore: 95 }),
          vacancy({ id: 3, matchScore: 70 }),
          vacancy({ id: 4, matchScore: 88 }),
          vacancy({ id: 5, matchScore: 61 }),
          vacancy({ id: 6, matchScore: 99 }),
          vacancy({ id: 7, matchScore: 100, userAction: 'APPLIED' }), // triaged already
        ],
      });

      expect(view.result.current.reviewQueue.map((v) => v.matchScore)).toEqual([
        99, 95, 88, 70, 61,
      ]);
    });
  });

  describe('recent activity', () => {
    it('shows the six latest moves, newest first', async () => {
      const view = await setUp({
        applications: Array.from({ length: 8 }, (_, i) =>
          application({ id: i + 1, statusUpdatedAt: daysAgo(i) }),
        ),
      });

      expect(view.result.current.recentActivity.map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  it('surfaces a load error instead of throwing', async () => {
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json(null, { status: 500 }),
      ),
      ...buildHandlers([]),
    );

    const view = renderHook(() => useDashboard(), { wrapper: withQueryClient() });
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    expect(view.result.current.loadError).toMatch(/HTTP 500/);
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
