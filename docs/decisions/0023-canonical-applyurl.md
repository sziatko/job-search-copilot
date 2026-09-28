# 0023 — `applyUrl` is stored canonicalized, with the query string dropped except where a site rule defines it

- Status: Accepted
- Phase: 2   ·   Date: 2026-09

## Context

`applyUrl` is the natural key of `Vacancy` (`String @unique`) and the
whole mechanism behind analyze-once (ADR-0005): `save()` looks the row up by it,
and the unique constraint is the real guard against a lost race.

But the value is scraped text. The same posting reached through two links arrives
as two strings:

```
https://acme.com/jobs/3912345678?utm_source=linkedin&fbclid=IwAR0…
https://acme.com/jobs/3912345678?ref=telegram
```

Two rows for one vacancy, and the second one's analysis silently discarded
against a key that never matched. A second database holding every posting seen,
deduplicated against this one, is planned — and a key that changes shape
depending on which link you clicked cannot carry that.

## Decision

`normalizeApplyUrl` (`packages/core/src/url.ts`) reduces an incoming URL to a
canonical form before it is ever used as a key. It does six things:

1. **Scheme gate** — only `http:`/`https:` survives; anything else returns
   `null`, and the caller substitutes its own fallback.
2. **Query strip** — the *entire* query string is dropped, not a curated list of
   tracking params (except on a host with a site rule — rule 6).
3. **Fragment strip** — *added 2026-09-21.* The fragment never reaches the
   server, so two links differing only by `#apply` are the same document by
   construction.
4. **Trailing-slash strip** — *added 2026-09-21.* `/jobs/123/` and `/jobs/123`
   collapse onto one key. This is the one rule here that is a judgement rather
   than a spec equivalence, and the reasoning is below.
5. **Canonicalization** — the value is round-tripped through `URL`, which
   lowercases the host, drops a default port, adds the `/` after a bare origin,
   and percent-encodes what needs it.
6. **Site rules** — *added 2026-09-21.* A short list of domains whose URLs
   *declare* which query param carries the vacancy id, each with a normalizer of
   its own (`SITE_RULES` in `packages/core/src/url.ts`). A matching domain's
   normalizer owns how the query is reduced, so rule 2 never runs on it; the
   fragment and trailing-slash rules still do. The list holds one entry: Indeed,
   keyed by `jk`.

Both write paths already called this function before the dedup lookup
(`vacancy.service.ts` `save()`, `application.service.ts`
`resolveVacancyId`), so the change lands on every path that writes an `applyUrl`
— REST, MCP, and the tracker import — without touching a call site.

## Why this and not the alternatives

- **A denylist of tracking params (`utm_*`, `fbclid`, …).** Never breaks a link,
  but it is a list of names we do not control, and every unknown tracker it
  misses is a duplicate row. It also cannot help with the case that matters
  most: two links that differ by a param nobody has heard of.
- **An allowlist of id-looking param names (`gh_jid`, `job_id`, …).** Catches
  the boards that carry the id in the query, but "looks like an id" is a guess
  with a built-in trap — `refId`, `trackingId` and `sessionId` all contain "id" —
  and a wrong guess drops a param the server needed, storing a **dead link**.
- **Rule 6 is not that allowlist**, though the two look alike enough that the
  difference has to be stated. There, the param name is guessed from its *shape*
  and applies to every host; here, it comes from one board's *published URL
  contract* — Indeed's `jk` is its vacancy key, carried by every locale and path
  spelling — and it applies only to the domain it was declared for, so
  `acme.com?jk=1` still loses its query. A wrong entry risks the same dead link
  the allowlist would, one domain at a time, and only after somebody looked at
  that domain's URLs.
- **Keeping the query when the path has no id, dropping it when it does.** This
  was the original intent, and it is strictly better than either list. It was set
  aside for a different reason: it needs a heuristic for "does this path carry an
  id" (a digit run? a UUID?), and that heuristic is a second guess stacked on the
  first. The chosen rule has no heuristic at all.
- **`parsed.search = ''` *without* `URL` round-tripping.** Rejected because the
  round-trip is the free half: host case, default port and the origin slash are
  equivalences the URL spec *guarantees*, not assumptions, so merging them costs
  nothing and catches a class of duplicate the query strip alone would miss.
- **Leaving the trailing slash and the fragment alone** — the original position,
  and the one the URL spec actually backs. Reversed on 2026-09-21, on evidence
  from the database it runs against: of 320 stored http(s) URLs, 47 carried a
  trailing slash and 46 of those were `linkedin.com/jobs/view/<id>/`, a spelling
  LinkedIn serves interchangeably with the slashless form. The two spellings
  arrive from different scrapers, so the cost of *not* merging is a duplicate row
  for one posting — the exact thing the unique index exists to prevent — while
  the cost of merging is a silent analysis discard, and that needs a server that
  genuinely serves two documents at `/x` and `/x/`. Nothing in the 361 rows
  suggests one does: no two rows are slash-variants of each other. The trade was
  made because the duplicate is the failure that demonstrably happens; if a wrong
  merge ever shows up (a vacancy whose analysis vanishes against an unrelated
  one), this is the rule to revisit first.

## Consequences

- Tracking variants of one posting collapse to one row. This is the point.
- **A posting whose vacancy id lives in the query loses its direct link** — unless
  its host has a site rule (rule 6). Where it does not, it is stored as the
  board's index page rather than the posting. Company and title stay on the row,
  so the posting is still findable by hand. The raw URL is not kept anywhere —
  that is the accepted cost of having no heuristic, and the reason this ADR
  exists.
- **An Indeed posting is keyed by `jk`, so its id survives** — but the locale
  prefix is *kept*, not merged: `pl.indeed.com/viewjob?jk=X` and
  `us.indeed.com/viewjob?jk=X` are two rows, and one posting seen through both
  locales is analysed twice. The id is global, so merging would have been
  defensible; it was declined so a stored link opens the locale the user actually
  scraped. That two-row cost is pinned by a test in `url.spec.ts`, so a later
  "cleanup" has to argue with a failing test rather than a paragraph.
- The failure rule 6 repairs was worse than a dead link, which is why the
  exception exists at all: before it, *every* Indeed posting from one locale
  canonicalized to the same `…/viewjob`, so the first took the row and each
  later one was silently discarded as an already-analysed duplicate.
- **A trailing slash on a non-empty path *is* normalized**, as is the fragment.
  So a server that genuinely serves two documents at `/jobs/123` and
  `/jobs/123/` has the second vacancy's analysis silently discarded against the
  first. That is the one merge in `normalizeApplyUrl` the URL spec does not back,
  and the only one to revisit if an analysis ever vanishes unexplained.
- **A synthetic key carries the day it was created**, so a vacancy with no usable
  URL saved again on a later day lands on a second key and becomes a second row.
  `save()` passes `new Date()` (`vacancy.service.ts`), which is why: two
  saves on the same day dedup, two saves a day apart do not. The tracker path
  passes a caller-supplied `appliedAt` and does not drift, so the two are not
  consistent with each other. Pinned as it stands by a test in
  `vacancy.service.spec.ts` rather than changed — the key's shape moves
  42 stored rows, and a backfill may not merge, so changing it is a migration, not
  an edit.
- **Rows written before 2026-09-21 kept their old, unstripped form** and did not
  match a canonicalized lookup. Not a regression (they did not match before
  either — that was the bug), but the unique constraint was weaker for them. A
  one-off backfill fixed them (removed in phase 3.1; git keeps it): dry run by
  default, one transaction on `--commit`, and it refused to touch a collision — two rows
  landing on one key — because the unique index makes the merge impossible anyway
  and picking a survivor is a judgement about which analysis and which
  application history to keep.
- **It was run on 2026-09-21**: 107 of 360 rows rewritten, 42 synthetic
  `tracker://` rows skipped (they fail the scheme gate by design and cannot
  drift), 0 non-canonical rows left. Two collision pairs had to be resolved by
  hand first — Box and Kraken, each stored twice because one posting arrived with
  `?trk=public_jobs_topcard-title` — and in both the *newer* row was the
  analyzer's, carrying no application, so it was deleted and the row holding the
  application was canonicalized. One further row (ABN AMRO, `Front-end
  Developer`) had its vacancy id *in* the query (`indeed.com/m/viewjob?jk=…`), so
  canonicalizing it would have left a dead link; its stored key was replaced with
  the synthetic form instead, which is stable and renders as text rather than a
  link.
- **Re-run after rule 6 landed** (2026-09-21, dry run): 0 rewrites, 0 collisions.
  The database holds no `applyUrl` containing a query at all, and the Indeed
  normalizer only acts on a `jk`, so no stored row can newly match a site rule. It
  also holds no Indeed row — the one this ADR describes (ABN AMRO) already carries
  the synthetic key — so there is nothing to repair. If an Indeed row is ever
  written under rule 2, its `jk` is not recoverable; that cost is named in the
  Context, and such a row is resolved by hand, one at a time.

## What this constrains — breaks if you change it

- Any code that compares a stored `applyUrl` against an incoming one **must run
  both sides** through `normalizeApplyUrl`. Comparing a raw stored value to a
  canonical incoming one silently reports "no match", which reads as a new
  vacancy and creates the duplicate this ADR exists to prevent.
- Any backfill rewriting pre-existing rows has to handle collisions: two old rows
  can canonicalize onto the same URL and violate the unique index. It must fail
  loudly and stop. A backfill never deletes and never merges — the
  human resolution *may* delete, as it did for the two pairs above, but that is a
  decision taken with both rows in view, not something a script gets to pick.
- `buildSyntheticApplyUrl` output (`tracker://…`) deliberately fails the scheme
  gate and is *not* passed through canonicalization. Idempotence of
  `normalizeApplyUrl` is asserted in `url.spec.ts`; do not make synthetic URLs
  round-trip through it.
- A site rule (rule 6) owns the query. **Nothing may post-process it** — applying
  rule 2 to its output would delete the `?jk=…` that *is* the identity and
  re-create the bug the rule fixes. It must stay idempotent: every lookup compares
  `normalizeApplyUrl(x)` against stored values, so a rule that mangles its own
  output stops matching the rows it wrote. The fragment and
  trailing-slash rules still apply to its output, and that is deliberate — the
  rule owns the query *only*, so those stay in one place.
- Adding an entry to `SITE_RULES` needs a real example whose URL shape somebody
  looked at, never a guess. A board that changes shape fails quietly: the rule
  stops matching and that host falls back to rule 2, which surfaces as a duplicate
  row or a discarded analysis, not a crash. A vanished analysis is the signal to
  re-read the rule.

## Related

- [ADR-0005](0005-analyze-once.md) — the invariant this key carries.
- [ADR-0027](0027-linkedin-site-rule.md) — a second site rule, LinkedIn, which *does* merge
  locale hosts (unlike Indeed above) and owns the path as well as the query.
- [`docs/domain-model.md`](../domain-model.md) — the `applyUrl` field.
- [`docs/contracts.md`](../contracts.md) — the value every read surface returns.
