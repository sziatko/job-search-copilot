# 0019 — Recording an application find-or-**creates** the `EstimatedVacancy`

- Status: Accepted
- Phase: 2   ·   Date: 2026-09

## Context

[ADR-0017](0017-application-1to1-delta.md) makes every `Application` link 1:1 to an
`EstimatedVacancy`. But most applications the user records — the whole `tracker.md`
history, and "I applied to X" typed into chat — are for vacancies that were never
run through the analyzer, so there is no row to link to, and the analyzer fields
are `NOT NULL`.

## Decision

`ApplicationService.record` resolves the vacancy in one transaction:

- **by id** (the web path) — link to the given `estimatedVacancyId`; unknown id →
  `InvalidApplicationInputError`.
- **by (company, title)** (MCP / import) — case-insensitive exact match:
  - exactly one → link to it.
  - zero → **create** an `EstimatedVacancy` with placeholder analyzer fields:
    `fullText = 'N/A'`; `matchScore` = the value passed (from the tracker's score
    text) or `0`; `recommendation` = the value passed, else
    `deriveRecommendationFromScore(matchScore)` (≥70 `APPLY`, ≥50
    `APPLY_WITH_CAVEATS`, else `SKIP`), else `'APPLY'`; `estimationComment` = the
    notes passed or `'N/A'`; `applyUrl` = the value passed or a synthetic
    `tracker://<company>/<title>/<YYYY-MM-DD>`. `userAction` is set to `APPLIED`
    at creation.
  - more than one → `AmbiguousVacancyMatchError` (lists the candidate ids).
- When linking to a vacancy that already existed and whose `userAction` isn't
  `APPLIED`, flip it to `APPLIED` (+ `userActionUpdatedAt`).

A second application for the same vacancy → `ApplicationAlreadyExistsError`.

## Why this and not the alternatives

- **Make the analyzer fields nullable.** The honest "no placeholder" version, but it
  changes the Phase 1 schema + zod contract in three places + every Phase 1 read
  path / sort. Rejected — see [ADR-0017](0017-application-1to1-delta.md).
- **Require the vacancy to be analysed first** ("analyse X before you can record an
  application"). Keeps the schema clean, but directly contradicts the "I applied to
  X in chat, no prior analysis" flow this feature is for. Rejected.

## Consequences

- `save_estimated_vacancy` is no longer the *only* creator of `EstimatedVacancy`
  rows, and `updateUserAction` is no longer the *only* writer of `userAction` —
  `record()` does both, within `updateUserAction`'s contract (it touches only
  `userAction` + `userActionUpdatedAt`). System invariant #3 is narrowed
  accordingly, not broken: the analyzer's fields and the user's field still have
  disjoint writers.
- The `/vacancies` list may now contain placeholder rows (`matchScore` 0,
  `fullText` `'N/A'`). They carry `userAction = APPLIED`, so the default
  `NOT_REVIEWED` filter hides them.
- Genuinely odd import data (missing date, unmappable status, a same-vacancy
  collision) is surfaced by the importer's dry run for the user to resolve, not
  guessed — [ADR-0021](0021-tracker-import-script.md).

## What this constrains — breaks if you change it

- Changing the placeholder values / the score→recommendation thresholds →
  `deriveRecommendationFromScore` in
  [`packages/core/src/recommendation.ts`](../../packages/core/src/recommendation.ts)
  and its spec; the web `MatchScoreBadge` uses the same 70 / 50 cut-offs — keep
  them in step.
- Removing the `userAction = APPLIED` side-effect → the `/vacancies` page and the
  Phase 1 `save`-then-`record` MCP spec stop seeing applied vacancies as applied.
- Loosening the (company, title) match to fuzzy → `AmbiguousVacancyMatchError`
  fires far more often; the importer's collision report gets noisier.

## Related

[ADR-0017](0017-application-1to1-delta.md),
[ADR-0018](0018-application-status-separate-enum.md),
[ADR-0021](0021-tracker-import-script.md),
[`../domain-model.md`](../domain-model.md).
