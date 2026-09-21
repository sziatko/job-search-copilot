import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysSinceLastMove, isActive, isTimedOut, matchesFilter, TIMEOUT_DAYS } from './constants';
import {
  type ApplicationListItem,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  STATUS_FILTER_TIMEOUT,
} from './types';

// The rule the tracker's headline numbers are made of: which of your applications
// have gone quiet. It is derived on the client (ADR-0022) and decides what the KPI
// tiles and the ⏳ mark in the table both show, so it is pinned here rather than
// only through a rendered tile.
const NOW = new Date('2026-09-21T12:00:00.000Z');
const MS_PER_DAY = 86_400_000;

/** `statusUpdatedAt` at a fixed distance before NOW. Fractional days allowed, so the
 * floor can be pinned without depending on the clock at run time. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
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

beforeEach(() => {
  // Fake `Date` only: this file does no I/O, but faking the whole timer set is the
  // habit that stalls async work when it creeps into a spec that does.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('daysSinceLastMove', () => {
  it('counts whole days since the row last moved', () => {
    expect(daysSinceLastMove(application({ statusUpdatedAt: daysAgo(0) }))).toBe(0);
    expect(daysSinceLastMove(application({ statusUpdatedAt: daysAgo(3) }))).toBe(3);
  });

  it('floors, so a part-day does not round up', () => {
    expect(daysSinceLastMove(application({ statusUpdatedAt: daysAgo(30.9) }))).toBe(30);
  });
});

describe('isTimedOut', () => {
  it('leaves day 30 in flight', () => {
    // The boundary, pinned rather than assumed. `Math.floor` followed by a strict
    // `>` means a row goes quiet for thirty whole days *and* a further day before
    // it counts as stalled — 30.9 days still reads Active. The constant is
    // TIMEOUT_DAYS = 30 and the code agrees with its own comment ("silent for
    // longer than TIMEOUT_DAYS"), so this is the intended reading, not an
    // off-by-one to be "fixed" without a decision.
    expect(TIMEOUT_DAYS).toBe(30);
    expect(isTimedOut(application({ statusUpdatedAt: daysAgo(30) }))).toBe(false);
    expect(isTimedOut(application({ statusUpdatedAt: daysAgo(30.9) }))).toBe(false);
  });

  it('flags a row once a full 31 days have passed', () => {
    expect(isTimedOut(application({ statusUpdatedAt: daysAgo(31) }))).toBe(true);
    expect(isTimedOut(application({ statusUpdatedAt: daysAgo(90) }))).toBe(true);
  });

  it('never flags a closed outcome, however old', () => {
    // A row that reached Offer or Rejected is finished, not stuck.
    expect(isTimedOut(application({ status: 'REJECTED', statusUpdatedAt: daysAgo(400) }))).toBe(
      false,
    );
    expect(isTimedOut(application({ status: 'OFFER', statusUpdatedAt: daysAgo(400) }))).toBe(false);
  });

  it('fails open on an unparseable date — the row reads as Active', () => {
    // Named rather than fixed: `NaN > 30` is false, so a corrupt stamp keeps the
    // row in the Active column and the table's hourglass tooltip renders
    // "NaN days since last update" (ApplicationsTable.tsx:95). `statusUpdatedAt`
    // is NOT NULL and server-stamped, so nothing produces this today — but the
    // failure mode is silent, which is what this test exists to record.
    const broken = application({ statusUpdatedAt: 'garbage' });
    expect(daysSinceLastMove(broken)).toBeNaN();
    expect(isTimedOut(broken)).toBe(false);
    expect(isActive(broken)).toBe(true);
  });
});

describe('isActive', () => {
  it('is the complement of isTimedOut among in-flight rows', () => {
    expect(isActive(application({ statusUpdatedAt: daysAgo(0) }))).toBe(true);
    expect(isActive(application({ statusUpdatedAt: daysAgo(30) }))).toBe(true);
    // A recruiter screen is *not* a closed outcome, so it is never excluded by
    // status — but at 90 days it is stale, which puts it in Timeout rather than
    // Active. Both buckets are status-blind apart from the rejected/offer pair.
    const staleScreen = application({ status: 'RECRUITER_SCREEN', statusUpdatedAt: daysAgo(90) });
    expect(isTimedOut(staleScreen)).toBe(true);
    expect(isActive(staleScreen)).toBe(false);
    expect(isActive(application({ statusUpdatedAt: daysAgo(31) }))).toBe(false);
  });

  it('excludes the closed outcomes it does not own', () => {
    expect(isActive(application({ status: 'REJECTED', statusUpdatedAt: daysAgo(400) }))).toBe(
      false,
    );
    expect(isActive(application({ status: 'OFFER', statusUpdatedAt: daysAgo(400) }))).toBe(false);
  });
});

describe('matchesFilter', () => {
  const fresh = application({ statusUpdatedAt: daysAgo(1) });
  const stale = application({ statusUpdatedAt: daysAgo(45) });
  const rejected = application({ status: 'REJECTED', statusUpdatedAt: daysAgo(1) });

  it('passes everything through ALL', () => {
    for (const row of [fresh, stale, rejected]) {
      expect(matchesFilter(row, STATUS_FILTER_ALL)).toBe(true);
    }
  });

  it('delegates the two derived filters to the rule', () => {
    expect(matchesFilter(fresh, STATUS_FILTER_ACTIVE)).toBe(true);
    expect(matchesFilter(stale, STATUS_FILTER_ACTIVE)).toBe(false);
    expect(matchesFilter(stale, STATUS_FILTER_TIMEOUT)).toBe(true);
    expect(matchesFilter(fresh, STATUS_FILTER_TIMEOUT)).toBe(false);
  });

  it('compares a stored status exactly', () => {
    expect(matchesFilter(rejected, 'REJECTED')).toBe(true);
    expect(matchesFilter(rejected, 'OFFER')).toBe(false);
  });
});

describe('the partition the constants promise', () => {
  it('puts every row in exactly one of active, timeout, rejected, offer', () => {
    // constants.ts:68 — "total = active + timeout + rejected + offer". The KPI
    // tiles are read as a breakdown of the log, so a row landing in two buckets
    // (or none) would make the numbers disagree with the list underneath them.
    const rows = [
      application({ id: 1, status: 'APPLIED', statusUpdatedAt: daysAgo(2) }),
      application({ id: 2, status: 'INTERVIEW', statusUpdatedAt: daysAgo(45) }),
      application({ id: 3, status: 'RECRUITER_SCREEN', statusUpdatedAt: daysAgo(31) }),
      application({ id: 4, status: 'REPLIED', statusUpdatedAt: daysAgo(30) }),
      application({ id: 5, status: 'REJECTED', statusUpdatedAt: daysAgo(400) }),
      application({ id: 6, status: 'OFFER', statusUpdatedAt: daysAgo(400) }),
    ];

    for (const row of rows) {
      const buckets = [
        isActive(row),
        isTimedOut(row),
        row.status === 'REJECTED',
        row.status === 'OFFER',
      ];
      expect(buckets.filter(Boolean)).toHaveLength(1);
    }
  });
});
