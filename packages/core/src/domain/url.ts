/**
 * URL handling for values that arrive from outside — scraped job postings, a
 * pasted link, the MCP tools. Kept in one module because every service that writes
 * an `applyUrl` needs the same two rules.
 */

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

/** Stand-in applyUrl for a vacancy that has no usable listing URL (`save()`, `record()`).
 * Not a real URL — the web app renders these as plain text, not a link. */
export function buildSyntheticApplyUrl(company: string, title: string, date: Date): string {
  return `tracker://${slug(company)}/${slug(title)}/${date.toISOString().slice(0, 10)}`;
}

/**
 * Domains that get their own normalizer instead of the blanket query strip.
 *
 * The strip below drops the whole query because which param carries the vacancy
 * id is unknowable from the URL alone (ADR-0023). For a board whose URL contract
 * *does* say which param that is, it is knowable — and dropping it costs more
 * than a dead link: every posting from that board collapses onto one key, and all
 * but the first are silently discarded by analyze-once.
 *
 * Not the allowlist ADR-0023 rejected: the param name is not guessed from its
 * shape, it is one board's published URL shape, and it applies only to the domain
 * it was declared for — `acme.com?jk=1` still loses its query. Entries are added
 * one at a time, only for a domain whose URLs somebody has actually looked at.
 *
 * A normalizer owns the query; the fragment and trailing-slash rules still apply
 * to its output. LinkedIn's is the one exception that owns the host and path as
 * well (ADR-0027) — any new rule that does the same must stay idempotent. Adding
 * a site is an entry here plus a function, nothing else.
 */
const SITE_RULES: { domain: string; normalize: (url: URL) => void }[] = [
  { domain: 'indeed.com', normalize: normalizeIndeed },
  { domain: 'linkedin.com', normalize: normalizeLinkedIn },
];

/**
 * LinkedIn serves one job id under a locale host (`pl.`, `nl.`, `www.`), with or
 * without a title slug, and under `/comm/` from email digests. All of them become
 * `https://www.linkedin.com/jobs/view/<id>`, no query (ADR-0027). Any other
 * LinkedIn path only loses its query, as on any host.
 */
function normalizeLinkedIn(parsed: URL): void {
  parsed.search = '';
  const id = /^\/(?:comm\/)?jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/.exec(parsed.pathname)?.[1];
  if (!id) return;
  parsed.protocol = 'https:';
  parsed.host = 'www.linkedin.com';
  parsed.pathname = `/jobs/view/${id}`;
}

/**
 * Indeed carries the vacancy id in `?jk=`, and prefixes the host with the locale
 * (`pl.`, `us.`, `nl.`, `www.`, or none). Only `jk` survives — the rest of the
 * query is tracking (`from`, `vjs`, `trk`).
 *
 * The locale prefix is kept as it arrived: `pl.indeed.com` and `us.indeed.com`
 * are two keys, and one posting seen through both is analysed twice. The id is
 * global, so merging them would be defensible — it is not done because a link
 * should open the page the user actually scraped. See ADR-0023.
 *
 * The `jk` value is never lowercased: folding an id that is case-sensitive stores
 * a dead link, and a duplicate row is the cheaper failure.
 */
function normalizeIndeed(parsed: URL): void {
  const jk = parsed.searchParams.get('jk');
  parsed.search = '';
  if (jk) parsed.searchParams.set('jk', jk);
}

/**
 * Neutralize an incoming `applyUrl` and reduce it to its canonical form.
 *
 * Two jobs, both about the same value being the row's identity — it is the
 * per-user unique key (`userId, applyUrl`) that analyze-once rests on (ADR-0005), and
 * it is what the web app writes into an `href`.
 *
 * **Neutralize.** Only http(s) can be a real listing link, and the rest is not
 * merely wrong — it is dangerous downstream: a `javascript:` URL in an `href`
 * executes on click, in the page's own origin, while the link text looks
 * entirely ordinary. Postings are scraped from the open web, so the scheme is
 * checked rather than trusted. (`data:` and `vbscript:` fail the same test.)
 * Returns null rather than a stub, so each caller picks its own fallback instead
 * of inheriting a value that looks usable and is not.
 *
 * **Canonicalize.** The whole query string is dropped, not a tracker denylist:
 * which param carries the vacancy id is unknowable from the URL alone, so
 * `?gh_jid=456` and `?utm_source=linkedin` are indistinguishable to us. Dropping
 * all of it is what collapses "the same posting reached through two marketing
 * links" into one key, which is the duplicate the unique constraint exists to
 * catch. The cost is named in ADR-0023, and so is its one exception: a host in
 * `SITE_RULES` declares which param carries its own vacancy id, and owns how its
 * query is reduced. The fragment goes the same way, for a
 * stronger reason: it never reaches the server, so two links differing only by
 * `#apply` are *provably* one document.
 *
 * Round-tripping through `URL` is deliberate: it lowercases the host, drops a
 * default port and adds the `/` after a bare origin. Those are equivalences the
 * URL spec guarantees, not guesses, so they are free dedup.
 *
 * A trailing slash on a non-empty path is stripped too — `/jobs/123/` and
 * `/jobs/123` collapse. That one is a judgement call, not a spec guarantee: a
 * server *may* serve different documents at those two paths, and when it does,
 * the second vacancy's analysis is discarded silently against the first. It is
 * taken because the opposite failure is the one that actually happens — scraper
 * A hands back the slash and scraper B does not, for one and the same posting, and a
 * duplicate row is what the unique key exists to prevent. See ADR-0023.
 */
export function normalizeApplyUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null; // not parseable as a URL at all
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  // A declared domain owns how its query is reduced; every other host loses it
  // whole. The leading '.' in the suffix check is what keeps `notindeed.com` out.
  const site = SITE_RULES.find(
    (rule) => parsed.hostname === rule.domain || parsed.hostname.endsWith(`.${rule.domain}`),
  );
  if (site) {
    site.normalize(parsed);
  } else {
    // Setting `search` to '' drops the query *and* the '?' with it, so the
    // fragment — including a '?' that lives inside it — is still there to clear.
    parsed.search = '';
  }
  parsed.hash = '';
  // Every trailing slash goes, keeping the leading one on the likes of `/jobs///`.
  // A loop, not `/\/+$/`: that rescans from every slash of a long run not at the end.
  const path = parsed.pathname;
  let end = path.length;
  while (end > 1 && path[end - 1] === '/') end--;
  parsed.pathname = path.slice(0, end);
  return parsed.href;
}

/**
 * The key an `applyUrl` filter compares against: the url as `save` would have stored
 * it. An unusable url (no http(s)) is compared raw, so a synthetic `tracker://` key
 * still finds its placeholder row.
 */
export function applyUrlKey(url: string): string {
  return normalizeApplyUrl(url) ?? url;
}
