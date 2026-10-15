/**
 * Only http(s) belongs in an `href`.
 *
 * `applyUrl` arrives from scraped job postings — untrusted input — and nothing
 * rejects a bad scheme on the way in, so this is the last line of defence. A
 * `javascript:` URL in an anchor executes on click, in this page's own origin,
 * and the link text looks entirely ordinary while it does.
 *
 * Deliberately a second implementation of `packages/core/src/domain/url.ts` rather than a
 * shared import: ADR-0012 keeps `core` — and therefore Prisma and pg — out of the
 * browser bundle. The duplication is the architecture, not an oversight.
 *
 * The synthetic `tracker://` URLs fail this test too, so the tables need no separate
 * check for them.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false; // not parseable as a URL at all
  }
}
