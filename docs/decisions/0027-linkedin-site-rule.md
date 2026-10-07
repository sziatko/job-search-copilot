# 0027 — LinkedIn site rule: one key per job id, locale host merged

- Status: Accepted
- Phase: 3   ·   Date: 2026-09

## Context

Under ADR-0023's rules, one LinkedIn posting still arrives as several keys:

```
https://www.linkedin.com/jobs/view/3900000001
https://pl.linkedin.com/jobs/view/senior-software-engineer-data-f-m-d-at-globex-3900000001?trk=public_jobs_topcard-title
https://www.linkedin.com/comm/jobs/view/3900000002/
```

The query and the trailing slash are already dropped. The locale host, the title slug
and the `/comm/` prefix (which email digests use) are not.

Most of the vacancy log's (ADR-0026) rows are LinkedIn, spread across `www`, `pl`,
`nl` and `/comm/`. **Every one** matches
`/(comm/)?jobs/view/(<slug>-)?<id>`. The file already shows the duplicate this causes:
Globex's `3900000001` is logged twice, once through `www` and once through `pl`.

## Decision

A `SITE_RULES` entry for `linkedin.com` (`normalizeLinkedIn` in
`packages/core/src/url.ts`). When the path matches `/(comm/)?jobs/view/(?:[^/]*-)?(\d+)`,
the URL becomes `https://www.linkedin.com/jobs/view/<id>`, with no query. Any other
LinkedIn path falls through to ADR-0023's usual query strip.

The rule applies to `Vacancy.applyUrl` as well as the log, and existing rows
were backfilled once.

## Why this and not the alternatives

- **Keep the locale host, as Indeed's rule does.** ADR-0023 declined to merge Indeed
  locales so that a stored link opens the page the user scraped. For Indeed that cost
  was hypothetical. For LinkedIn the duplicate is measured, and both the `www` link and
  the locale link open the same posting. The data decided it, the same way it decided
  ADR-0023's trailing-slash reversal.
- **Only strip the slug and keep the host.** That still leaves 3 keys per posting.
- **Collapse only inside the log.** Two sets of URL rules is exactly the drift ADR-0026
  exists to prevent.

## Consequences

- **This rule owns the host and the path, not only the query.** ADR-0023 says a site
  normalizer owns the query only. This rule is the exception, and it is the only one.
  It must stay idempotent: `www…/jobs/view/<id>` maps to itself.
- A `jobs/search?currentJobId=` link (none in the data today) does not match. Rule 2
  strips it to the search page, and every such link collapses onto one key. Add it to
  this rule when one is actually seen.
- A backfill may find collision pairs: one posting analysed twice under two
  spellings. Per ADR-0023 it refuses these, and the user resolves each one by hand.

## What this constrains — breaks if you change it

- The `url.spec.ts` cases for this rule (slug, locale host, `?trk=`, `/comm/`, trailing
  slash, idempotence) pin it. Loosening the regex to any trailing digit run would catch
  non-job paths.
- Changing the output shape moves every stored LinkedIn key in *both* tables, so it
  needs a backfill.

## Related

[ADR-0023](0023-canonical-applyurl.md), [ADR-0033](0033-unscored-vacancies-in-one-table.md),
[`../phases/phase-3.md`](../phases/phase-3.md).
