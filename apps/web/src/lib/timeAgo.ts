const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "5 minutes ago", "yesterday". A future timestamp (server/browser clock skew) clamps
 * to "this minute" rather than render a negative number, and an unparseable one fails
 * open like `daysSinceLastMove` — `relative.format` on NaN throws `RangeError`, and
 * there is no error boundary in the router, so one bad stamp would take the whole
 * render with it. */
export function timeAgo(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  // Not `elapsed < HOUR`: NaN fails every comparison below and would reach format().
  if (!Number.isFinite(elapsed)) return 'unknown';
  if (elapsed < HOUR) return relative.format(-Math.max(Math.round(elapsed / MINUTE), 0), 'minute');
  if (elapsed < DAY) return relative.format(-Math.round(elapsed / HOUR), 'hour');
  return relative.format(-Math.round(elapsed / DAY), 'day');
}
