import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysSinceLastMove } from './constants';
import type { ApplicationListItem } from './types';

// The ⏳ tip's number. Whether a row is timed out is the server's `timedOut`
// (ADR-0031); core's spec pins that rule.
const NOW = new Date('2026-09-21T12:00:00.000Z');
const MS_PER_DAY = 86_400_000;

/** `statusChangedAt` at a fixed distance before NOW. Fractional days allowed, so the
 * floor can be pinned without depending on the clock at run time. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

function application(overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return {
    id: 1,
    appliedAt: NOW.toISOString(),
    status: 'APPLIED',
    statusChangedAt: NOW.toISOString(),
    timedOut: false,
    comments: [],
    salaryInApplication: null,
    usedTailoredResume: false,
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://acme.com/jobs/1',
    matchScore: 80,
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
    expect(daysSinceLastMove(application({ statusChangedAt: daysAgo(0) }))).toBe(0);
    expect(daysSinceLastMove(application({ statusChangedAt: daysAgo(3) }))).toBe(3);
  });

  it('floors, so a part-day does not round up', () => {
    expect(daysSinceLastMove(application({ statusChangedAt: daysAgo(30.9) }))).toBe(30);
  });
});
