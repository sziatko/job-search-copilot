# 0033 — Unscored vacancies live in `Vacancy`: the log merges in, `NEW` and `FILTERED_OUT`

- Status: Accepted (amends 0005)
- Phase: 5   ·   Date: 2026-10
- Replaces: 0026 (deleted with the last of its code — `/log`, phase 5 step 5)

## Context

Vacancy sources are to be collected mechanically by n8n (no AI), and an agent pulls the
unscored ones later, reads each posting once and sends back only the verdict. That
needs somewhere to keep a posting before it has an analysis. Two tables could hold it:
the dedup log (`VacancyLogEntry`, ADR-0026), which has no text and no status, or
`Vacancy`, whose analysis fields were `NOT NULL`.

ADR-0026 rejected putting unscored postings in `Vacancy` for two reasons: it would
break analyze-once (ADR-0005), and placeholder analysis fields on 1000+ unscreened rows
would flood `/vacancies`. Both are answered below. Two tables, meanwhile, would each
need their own dedup, statuses, a page, and a move from one to the other when the
analysis lands.

## Decision

**One table.** `Vacancy.fullText`, `matchScore` and `recommendation` are nullable; both
analysis fields `null` = not analysed yet. New columns: `companyKey` / `titleKey`
(intake's second match, from `normalizeCompanyKey` / `normalizeTitleKey` in
`identity.ts`; `record()`'s lookup by name too since 2026-10, ADR-0019; null only
when the name normalizes to nothing, e.g. `—`) and `source` (free text, `null` on rows
not taken in by intake). `VacancyLogEntry` is dropped: every log row became a vacancy
(migration `20261003130100`).

**Two statuses**, both triage (`TRIAGE_STATUSES`):

- `NEW` — the analysis queue. The column's default; every journal starts with it, dated
  the day the vacancy came in, on every path (intake, `save()`, `record()`'s
  placeholder — `firstStatus`).
- `FILTERED_OUT` — screened out before triage, by the analyzer's `SKIP` or by the user.
  Not `DECLINED`, which stays "I read the analysis and chose not to apply".

**Analyze-once becomes "the analysis is written once"** — the row can exist before its
analysis. `save()` on an existing `applyUrl` still returns it untouched; an analysis
is attached to an unscored row by a conditional write (`WHERE recommendation IS NULL`,
`submitAnalysis`, phase 5 step 3).

**One exception to "`recommendation` is the analyzer's, `status` the user's":** the
analyzer moves a status in exactly one case — out of `NEW`, in the transaction that
writes the analysis: `SKIP` → `FILTERED_OUT`, anything else → `NOT_REVIEWED`
(`statusAfterAnalysis` in `status.ts`; the rule lives in `core`, never in an agent).
It cannot clobber the user's progress: it only fires from `NEW`. `save()` journals
`NEW`, then the rule's status, both dated now.

**Two DB CHECKs** (hand-written, invisible to Prisma): the analysis is both fields or
neither (`Vacancy_analysis_both_or_neither`), and an analysed row is never `NEW`
(`Vacancy_new_is_unanalysed`). The rest of the lifecycle (`NEW` exits only by an
analysis or a manual `FILTERED_OUT`; `FILTERED_OUT → NEW` only without an analysis) is
the UI's, like the rest of it — but `writeStatus` refuses `NEW` on an analysed row
first (`AnalysedNotNewError`: REST `422`, MCP `isError`), so the CHECK never answers a
caller with a `500` (phase 5 step 5).

**Intake** (`VacancyIntakeService`, replacing `VacancyLogService`): url, company and
title are required. Match by `applyUrl`, else by `(companyKey, titleKey)`, the oldest
row. A miss creates the vacancy in `NEW` with `source` and `fullText` when given; a hit
only gets the text it lacked — never a status, a source or an analysis. Returns
`{ new }`, nothing else.

## Why this and not the alternatives

- **Keep the log beside `Vacancy`.** Two dedups that must agree, and a copy from one
  table to the other when the analysis lands. Unscored rows never reach `/vacancies`
  anyway, because they carry their own statuses.
- **Keep `@unique(applyUrl)` as the analyze-once guard alone.** It stops a second row,
  not a second analysis of the same row; the conditional write does.
- **A `NOT NULL` analysis with placeholder values (`0` / `APPLY`).** What placeholders
  did until now; `APPLY` sorted them to the top of `sort=recommended`, and every reader
  had to know the sentinel. The migration nulls them where no `ANALYZER` comment exists.
- **`DECLINED` for the analyzer's `SKIP`.** Mixes "the analyzer said no" with "I said
  no", and the dashboard counts the latter.
- **`NOT NULL` keys.** A name that normalizes to nothing (`—`, 12 migrated log rows)
  has no key; such a row is matched by url only.

## Consequences

- `GET /stats`' `logged` counts every vacancy.
- `hasAnalysis` is `recommendation !== null` (was: an `ANALYZER` comment exists). A
  placeholder with only an `ANALYZER` comment reads as unanalysed.
- `sort=recommended` puts the unanalysed last (Postgres' `NULLS LAST` on `asc`). Prisma
  pages a nullable sort in memory from the cursor row, which it cannot find once the row
  has left the filter, so `VacancyService.list` keeps the cursor row in the result
  (`OR id = cursor`) and `toCursorPage` drops it — at the cost of reading every row
  after the cursor, not one page.
- `record_application` by `(company, title)` meets more matches: the 880 migrated log
  rows can share a name with an existing vacancy (15 ambiguous name groups on the dev DB
  before, 26 after).
- The keys of rows with no log row are computed by a one-off script,
  `packages/core/scripts/backfill-match-keys.ts` (dry run by default, one transaction
  on `--commit`), run once after the migration.

## What this constrains — breaks if you change it

- Writing an analysis while the row is `NEW`, or writing one field without the other →
  the CHECKs reject the statement. `save()` and `record()` create the row unanalysed,
  move it out of `NEW`, then write the analysis.
- Writing a vacancy without `companyKey` / `titleKey` (outside intake, `save()`,
  `record()` — all three take them from `matchKeys`) → neither intake nor `record()`
  matches it by name. Changing `normalizeCompanyKey` /
  `normalizeTitleKey` leaves every stored key in the old shape — it needs a backfill.
- Moving a status on analysis from anything but `NEW` → the analyzer clobbers the
  user's progress.
- Dropping the `OR id = cursor` in `VacancyService.list` → `/vacancies` stops loading
  pages after a row is triaged out of the filter (`vacancy.service.spec.ts`, "pages on
  from a cursor row that has left the filter").

## Related

[ADR-0005](0005-analyze-once.md),
[ADR-0029](0029-one-vacancy-table.md), [ADR-0030](0030-cursor-paging.md),
[`../phases/phase-5.md`](../phases/phase-5.md), `packages/core/src/vacancy-intake.service.ts`,
`packages/core/src/status.ts`.
