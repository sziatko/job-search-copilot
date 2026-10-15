# 0023 — `applyUrl` is stored canonicalized: the query dropped, except where a site rule defines it

- Status: Accepted · Date: 2026-09

## Context
`applyUrl` is a vacancy's natural key (`@@unique([userId, applyUrl])`) and what
analyze-once rests on ([ADR-0005](0005-analyze-once.md)). But it is scraped text: one
posting reached through two links arrives as two strings —

```
https://acme.com/jobs/3912345678?utm_source=linkedin&fbclid=IwAR0…
https://acme.com/jobs/3912345678?ref=telegram
```

— two rows for one vacancy, and the second analysis lost against a key that never
matched.

## Decision
`normalizeApplyUrl` (`packages/core/src/domain/url.ts`) reduces a URL to a canonical
form before it is used as a key:

1. **Scheme gate** — only `http:` / `https:`; anything else returns `null` and the
   caller uses its own fallback.
2. **Query strip** — the *whole* query string, not a list of tracking params (except
   on a host with a site rule, rule 6).
3. **Fragment strip** — it never reaches the server.
4. **Trailing-slash strip** — `/jobs/123/` and `/jobs/123` are one key.
5. **Round-trip through `URL`** — lowercases the host, drops a default port, adds the
   `/` after a bare origin, percent-encodes.
6. **Site rules** (`SITE_RULES`) — a domain whose URLs *declare* where the vacancy id
   is gets its own normalizer, which owns the query. Indeed keeps `?jk=` (its vacancy
   key) and its locale host; LinkedIn is reduced to `www.linkedin.com/jobs/view/<id>`
   ([ADR-0027](0027-linkedin-site-rule.md)). The fragment and slash rules still apply.

Every write path (intake, `save()`, `record()`) and every lookup by url run it.

## Why this and not the alternatives
- **A denylist of tracking params** (`utm_*`, `fbclid`, …) — a list of names we do not
  control; every unknown tracker is a duplicate row.
- **An allowlist of id-looking params** (`job_id`, `gh_jid`) — "looks like an id" is a
  guess (`refId`, `trackingId`), and a wrong one drops a param the server needs: a
  dead link. A site rule differs: it comes from one board's published URL shape, and
  applies to that domain only.
- **Keep the query when the path has no id** — needs a heuristic for "the path carries
  an id"; a second guess on top of the first.
- **Leave the slash and the fragment** — what the URL spec backs. But one board served
  the same posting with and without the slash, from different scrapers, so the
  duplicate row is the failure that actually happens; a server serving two documents
  at `/x` and `/x/` has not been seen.

## Consequences
- Tracking variants of one posting collapse to one row.
- **A posting whose id lives in the query loses its direct link**, unless its host has
  a site rule: it is stored as the board's page, findable by company and title. The
  raw URL is not kept — the cost of having no heuristic.
- An Indeed posting seen through two locales is two rows: the locale is kept so a
  stored link opens the one the user saw. Pinned by `url.spec.ts`.
- The slash strip is the one merge the spec does not back: if an analysis ever
  vanishes against an unrelated row, it is the rule to revisit first.
- A vacancy with no usable url gets a synthetic `tracker://<company>/<title>/<date>`
  key, which fails the scheme gate on purpose. It carries the day, so the same
  url-less vacancy saved on another day is a second row.

## What this constrains — breaks if you change it
- Comparing a stored `applyUrl` with an incoming one **without normalizing both** →
  "no match", a new row, the duplicate this exists to prevent.
- A backfill rewriting stored rows → two rows can land on one key and violate the
  unique index. It must stop and report, never merge or delete: picking a survivor is
  a human decision.
- A site rule's output post-processed by rule 2 → the `?jk=` that *is* the identity is
  deleted. Rules must be idempotent: lookups compare `normalizeApplyUrl(x)` with what
  the rule wrote.
- A new `SITE_RULES` entry → only from real example URLs somebody looked at. A board
  that changes shape fails quietly (the rule stops matching), as a duplicate row or a
  discarded analysis.

## Related
[ADR-0005](0005-analyze-once.md), [ADR-0027](0027-linkedin-site-rule.md),
`packages/core/src/domain/url.spec.ts`.
