# 0029 — One `Vacancy` table: one status, a `StatusChange` journal, comments with a `source`

- Status: Accepted · Date: 2026-09
- Replaces: 0017, 0018, 0028

## Context
A vacancy's state has three parts: the analysis, the user's progress (triage, then the
pipeline after applying), and notes from the analyzer, the user and agents. Spread
over a vacancy table and a 1:1 application table, with two status enums cut at
`APPLIED`, it gave two places to write a note, three dates for one history, and a join
on every read.

## Decision
- **One table, `Vacancy`**: the analyzer's fields, written once; the current state —
  `status`, `statusChangedAt`, `salaryInApplication`, `usedTailoredResume`. An
  *application* is a vacancy whose status is in the pipeline.
- **One status enum, `VacancyStatus`**: triage, then the pipeline
  (`PIPELINE_STATUSES`). The values: [`domain-model.md`](../domain-model.md).
- **`StatusChange`** `(vacancyId, status, createdAt)` is the journal: one row per move,
  its `createdAt` the only date of that move. The applied date is the latest
  `APPLIED` row's. `Vacancy.status` / `statusChangedAt` cache the latest row.
  `writeStatus` alone writes the row and the cache, in the caller's transaction.
  - A **pipeline** status written again is an event (the next interview round):
    journaled, the date moves. A caller writes once per real event.
  - A **triage** status the vacancy already has carries no event: `writeStatus` throws
    `SameStatusError` (API 422, MCP `isError`) and writes nothing. The web does not
    offer a row's current status.
- **`Comment`** `(vacancyId, source, body, createdAt)` holds every note; `source` is
  `ANALYZER | USER | AGENT`. Append-only. Reads still return `estimationComment`,
  derived from the first `ANALYZER` row.

The rule behind the split: a fact with one value per vacancy is a column; a fact with
many values is a 1:N table.

## Why this and not the alternatives
- **A 1:1 application table** — a join on every `/applications` read and a uniqueness
  guard, for three columns. A 1:1 split pays only for a large optional column group,
  different access rights or a hot write path; none applies.
- **Two status columns and a CHECK** — the two enums were one lifecycle cut at
  `APPLIED`.
- **The current status derived from the journal, not cached** — every filter, the
  timeout rule and the sort would need "latest row per vacancy" subqueries, raw SQL in
  Prisma. The cache has one writer, so it cannot drift.
- **An editable user comment beside the table** — two places to write a note.

## Consequences
- Timeout ([ADR-0022](0022-timeout-derived-until-scheduled.md)) and the
  `/applications` sort read `statusChangedAt`, the last move.
- An application's id is the vacancy's.
- MCP has one `update_vacancy_status`.

## What this constrains — breaks if you change it
- `status` written anywhere but `writeStatus` → the cache and the journal disagree;
  timeout, the sort and `appliedAt` read the wrong date.
- A pipeline repeat turned into a no-op → a second interview round leaves no trace,
  and the timeout clock keeps counting from the first.
- A new `VacancyStatus` value → the checklist in `domain-model.md`; there is no single
  source ([ADR-0012](0012-web-hand-written-contract.md)).
- A comment without a `source` → the web cannot colour it, and reads cannot find the
  analyzer's.

## Related
[ADR-0019](0019-record-or-create-vacancy.md), [ADR-0033](0033-unscored-vacancies-in-one-table.md).
