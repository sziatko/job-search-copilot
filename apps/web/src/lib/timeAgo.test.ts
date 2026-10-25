import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeAgo } from './timeAgo';

const NOW = new Date('2026-09-21T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

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
    // render with it. /applications' `daysSinceLastMove` fails open the same way.
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
