# 0019 — Recording an application find-or-**creates** the `Vacancy`

- Status: Accepted · Date: 2026-09

## Context
An application is a `Vacancy` whose status is in the pipeline
([ADR-0029](0029-one-vacancy-table.md)). But many applications the user records — "I
applied to X", told to Claude in a chat — are for postings never taken in or
analysed: there is no row to move.

## Decision
`ApplicationService.record` resolves the vacancy in one transaction:

- **by id** (the web) — the given `vacancyId`; an unknown one → `VacancyNotFoundError`
  (REST `404`).
- **by name** (MCP) — the posting as intake finds it
  ([ADR-0033](0033-unscored-vacancies-in-one-table.md), `identity.ts`): the vacancy with
  the passed `applyUrl` (normalized) if there is one, else an equal
  `(companyKey, titleKey)` — case, punctuation and legal forms aside, so `Acme` finds
  `Acme Sp. z o.o.`. A url that matches nothing (the company's ATS link for a posting
  stored under its LinkedIn link) falls through to the name.
  - one match → link to it;
  - none → **create** a placeholder: no posting text; no analysis unless a
    `matchScore` was passed (then `recommendation` is the caller's, or
    `deriveRecommendationFromScore`: ≥ 70 `APPLY`, ≥ 50 `APPLY_WITH_CAVEATS`, else
    `SKIP`); an `ANALYZER` comment only if one was passed; `applyUrl` the passed one,
    or a synthetic `tracker://<company>/<title>/<date>`. Journaled `NEW` like every
    vacancy;
  - several → `AmbiguousVacancyMatchError`, listing the ids.
- Then `writeStatus(APPLIED)`, and `writeStatus(status)` if the caller records it
  further along — so the applied date is in the journal either way.

A vacancy already in the pipeline → `AlreadyAppliedError`; one set back to triage can
be applied to again.

## Why this and not the alternatives
- **Require an analysis first** — contradicts the "I applied to X in a chat" flow this
  exists for.
- **A fuzzy match** — links an application to the wrong posting, silently.

## Consequences
- `record()` creates vacancies too, but writes status only through `writeStatus`, so
  invariant 3 holds: the analysis and the status still have disjoint writers.
- A placeholder sits in the pipeline, so `/vacancies`' default filter does not show it.

## What this constrains — breaks if you change it
- The score → recommendation thresholds → `deriveRecommendationFromScore`
  (`domain/recommendation.ts`) and its spec. The web colours a score in
  `ScorePill.tsx` at 70 / **55**, while core cuts at 70 / **50**: a 52 is
  `APPLY_WITH_CAVEATS` in the database and "low" on screen. Nothing makes them agree.
- A status written in `record()` other than through `writeStatus` → the applied date
  goes missing and the cache drifts from the journal.
- Matching on `companyGroupKey` ([ADR-0032](0032-same-company-normalised-name.md))
  instead of `companyKey` → one wrong match links the application to another posting.

## Related
[ADR-0029](0029-one-vacancy-table.md), [`../domain-model.md`](../domain-model.md)
§ Applications.
