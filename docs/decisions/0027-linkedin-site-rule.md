# 0027 — LinkedIn site rule: one key per job id, locale host merged

- Status: Accepted · Date: 2026-09

## Context
Under [ADR-0023](0023-canonical-applyurl.md)'s rules one LinkedIn posting still
arrives as several keys:

```
https://www.linkedin.com/jobs/view/3900000001
https://pl.linkedin.com/jobs/view/senior-software-engineer-at-globex-3900000001?trk=public_jobs_topcard-title
https://www.linkedin.com/comm/jobs/view/3900000002/
```

The query and the slash are dropped; the locale host, the title slug and `/comm/`
(email digests use it) are not. Most postings come from LinkedIn, so this is where
duplicates actually happen.

## Decision
A `SITE_RULES` entry for `linkedin.com` (`normalizeLinkedIn` in
`packages/core/src/domain/url.ts`): a path matching
`/(comm/)?jobs/view/(?:[^/]*-)?(\d+)` becomes `https://www.linkedin.com/jobs/view/<id>`,
no query. Any other LinkedIn path gets ADR-0023's plain query strip.

## Why this and not the alternatives
- **Keep the locale host, as Indeed's rule does** — for LinkedIn the duplicates are
  real, and the `www` link and a locale link open the same posting.
- **Strip only the slug** — still several keys per posting.

## Consequences
- **This rule owns the host and the path, not only the query** — the one exception to
  ADR-0023's "a site rule owns the query". It must stay idempotent:
  `www…/jobs/view/<id>` maps to itself.
- A `jobs/search?currentJobId=` link does not match: it is stripped to the search page,
  and every such link collapses onto one key. Add it to the rule when one is seen.

## What this constrains — breaks if you change it
- The rule's cases in `url.spec.ts` (slug, locale host, `?trk=`, `/comm/`, slash,
  idempotence) pin it. A regex loosened to any trailing digit run would catch non-job
  paths.
- A changed output shape moves every stored LinkedIn key: it needs a backfill, with
  ADR-0023's collision rule.

## Related
[ADR-0023](0023-canonical-applyurl.md).
