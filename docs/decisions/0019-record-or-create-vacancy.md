# 0019 — Recording an application find-or-**creates** the `Vacancy`

- Status: Accepted
- Phase: 2   ·   Date: 2026-09 (updated in phase 3.1: an application is a vacancy in the
  pipeline — [ADR-0029](0029-one-vacancy-table.md))

## Context

An application is a `Vacancy` whose status is in the pipeline
([ADR-0029](0029-one-vacancy-table.md)). But many applications the user records — the
old `tracker.md` history, and "I applied to X" typed into chat — are for vacancies that
were never run through the analyzer, so there is no row to move, and the analyzer
fields are `NOT NULL`.

## Decision

`ApplicationService.record` resolves the vacancy in one transaction:

- **by id** (the web path) — link to the given `vacancyId`; unknown id →
  `InvalidApplicationInputError`.
- **by (company, title)** (MCP) — case-insensitive exact match:
  - exactly one → link to it.
  - zero → **create** a `Vacancy` with placeholder analyzer fields:
    `fullText = 'N/A'`; `matchScore` = the value passed or `0`; `recommendation` =
    the value passed, else `deriveRecommendationFromScore(matchScore)` (≥70 `APPLY`,
    ≥50 `APPLY_WITH_CAVEATS`, else `SKIP`), else `'APPLY'`; an `ANALYZER` comment only
    when `estimationComment` was passed; `applyUrl` = the value passed or a synthetic
    `tracker://<company>/<title>/<YYYY-MM-DD>`. It starts `NOT_REVIEWED`, like any
    vacancy.
  - more than one → `AmbiguousVacancyMatchError` (lists the candidate ids).
- Then the vacancy moves to `APPLIED` through `writeStatus` — the only writer of
  status — and to the given pipeline `status` after it, if one was passed.

A vacancy already in the pipeline → `AlreadyAppliedError`. One set back to triage can
be applied to again.

## Why this and not the alternatives

- **Make the analyzer fields nullable.** The honest "no placeholder" version, but it
  changes the Phase 1 schema + zod contract in three places + every Phase 1 read
  path / sort. Rejected.
- **Require the vacancy to be analysed first** ("analyse X before you can record an
  application"). Keeps the schema clean, but directly contradicts the "I applied to
  X in chat, no prior analysis" flow this feature is for. Rejected.

## Consequences

- `save_vacancy` is not the *only* creator of `Vacancy` rows — `record()` creates
  placeholders. It writes status only through `writeStatus`, so system invariant #3
  holds: the analyzer's fields and the user's status still have disjoint writers.
- The `/vacancies` list may contain placeholder rows (`matchScore` 0, `fullText`
  `'N/A'`, no `ANALYZER` comment — `hasAnalysis: false`). They are in the pipeline,
  so the default `NOT_REVIEWED` filter hides them.

## What this constrains — breaks if you change it

- Changing the placeholder values / the score→recommendation thresholds →
  `deriveRecommendationFromScore` in
  [`packages/core/src/recommendation.ts`](../../packages/core/src/recommendation.ts)
  and its spec. The web colours the same score through
  [`ScorePill.tsx`](../../apps/web/src/components/ui/ScorePill.tsx) — the component
  that replaced `MatchScoreBadge` in the 2026-09 redesign (ADR-0024).
  **These two have drifted: core cuts at 70 / 50, the pill at 70 / 55** — the pill's
  boundaries were taken from the mockup's `scoreClass`, not from here. A vacancy
  scoring 52 is `APPLY_WITH_CAVEATS` in the database and "lo" on screen. Nothing
  enforces agreement; decide which is intended before changing either.
- Writing the status in `record()` other than through `writeStatus` → the applied date
  (the latest `APPLIED` journal row) goes missing, and the cache drifts from the
  journal.
- Loosening the (company, title) match to fuzzy → `AmbiguousVacancyMatchError`
  fires far more often.

## Related

[ADR-0029](0029-one-vacancy-table.md), [`../domain-model.md`](../domain-model.md).
