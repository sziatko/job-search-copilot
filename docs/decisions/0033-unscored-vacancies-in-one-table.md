# 0033 — Unscored vacancies live in `Vacancy`: `NEW` and `FILTERED_OUT`

- Status: Accepted · Date: 2026-10
- Replaces: 0026

## Context
Postings are collected mechanically (n8n, no AI), and an agent later pulls the unscored
ones, reads each once and sends back only the verdict. A posting needs a home before it
has an analysis. A second table for unscored postings would need its own dedup that
must agree with `Vacancy`'s, its own statuses and page, and a move from one table to
the other when the analysis lands.

## Decision
**One table.** `Vacancy.fullText`, `matchScore` and `recommendation` are nullable; both
analysis fields `null` = not analysed yet. `companyKey` / `titleKey`
(`normalizeCompanyKey` / `normalizeTitleKey` in `identity.ts`) are the match by name —
intake's, and `record()`'s ([ADR-0019](0019-record-or-create-vacancy.md)); `null` only
when the name normalizes to nothing (`—`), and such a row is matched by url only.
`source` records where intake found the posting.

**Two triage statuses:**

- `NEW` — the analysis queue. The column's default; every journal starts with it, dated
  the day the vacancy came in (`firstStatus`, on every create path).
- `FILTERED_OUT` — screened out before triage, by the analyzer's `SKIP` or by the user.
  Not `DECLINED`, which is "I read the analysis and chose not to apply".

**An exception to "`recommendation` is the analyzer's, `status` the user's":** the
analysis moves a status only out of `NEW`, in the transaction that writes it: `SKIP` →
`FILTERED_OUT`, anything else → `NOT_REVIEWED` (`statusAfterAnalysis` in `status.ts`;
the rule is core's, never an agent's). Only from `NEW`, so it never clobbers the user's
progress. (The other machine move, a closed posting to `UNAVAILABLE`, is
[ADR-0040](0040-machine-moves-queue-to-unavailable.md)'s.)

**Two DB CHECKs** (hand-written, invisible to Prisma): the analysis is both fields or
neither (`Vacancy_analysis_both_or_neither`); an analysed row is never `NEW`
(`Vacancy_new_is_unanalysed`). `writeStatus` refuses `NEW` on an analysed row first
(`AnalysedNotNewError`), so a caller never meets the CHECK as a `500`.

**Intake** (`VacancyIntakeService`): url, company and title required. Match by
`applyUrl`, else by `(companyKey, titleKey)`, the oldest row. A miss creates the vacancy
in `NEW`, with `source` and `fullText` when given; a hit only gets the text it lacked —
never a status, a source or an analysis. It answers `{ new }`.

## Why this and not the alternatives
- **A separate table for unscored postings** — two dedups that must agree, and a copy
  when the analysis lands. Unscored rows stay off `/vacancies` anyway: their statuses
  are the inbox's.
- **`@@unique(userId, applyUrl)` as the only guard** — it stops a second row, not a
  second analysis of the same row; the conditional write does
  ([ADR-0005](0005-analyze-once.md)).
- **`NOT NULL` analysis fields with placeholder values** (`0` / `APPLY`) — `APPLY` would
  sort unscored rows to the top of `sort=recommended`, and every reader would have to
  know the sentinel.
- **`DECLINED` for the analyzer's `SKIP`** — mixes "the analyzer said no" with "I said
  no", and the dashboard counts the latter.

## Consequences
- `hasAnalysis` is `recommendation !== null`.
- `sort=recommended` puts the unanalysed last (`NULLS LAST` on `asc`); the paging cost
  is in [ADR-0030](0030-cursor-paging.md).
- Filtered-out rows are record-or-link candidates too, so `record_application` by name
  meets more ambiguous matches (a backlog row).
- A change to the key functions leaves stored keys in the old shape, and needs a
  backfill. `npm run backfill:match-keys -w @job-search-copilot/core` fills only null
  keys (dry run by default, `--commit` to write); rewriting stored ones would extend it.

## What this constrains — breaks if you change it
- An analysis written while the row is `NEW`, or one field without the other → the
  CHECKs reject it. `save()` and `record()` create the row unanalysed, move it out of
  `NEW`, then write the analysis.
- A vacancy created without `matchKeys` → neither intake nor `record()` finds it by name.
- A status moved by the analysis from anything but `NEW` → the analyzer clobbers the
  user's progress.

## Related
[ADR-0005](0005-analyze-once.md), [ADR-0029](0029-one-vacancy-table.md),
`packages/core/src/intake/vacancy-intake.service.ts`, `packages/core/src/domain/status.ts`.
