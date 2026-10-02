# 0029 — One `Vacancy` table: one status, a `StatusChange` journal, comments with a `source`

- Status: Accepted
- Phase: 3.1   ·   Date: 2026-09
- Replaces: 0017, 0018, 0028 — deleted; read them with
  `git log --all -- 'docs/decisions/00NN-*'`.

## Context

By the end of phase 3, the state of one vacancy was spread over two tables and three
mechanisms:

- **Comments:** `EstimatedVacancy.estimationComment` (the analyzer), `Application.userComment`
  (the user, editable), and a `Comment` table keyed on `applicationId` (status notes and
  later notes).
- **Status:** `EstimatedVacancy.userAction` (triage) and `Application.status` (the
  pipeline), with `APPLIED` in both enums.
- **Dates:** `userActionUpdatedAt`, `appliedAt`, `statusUpdatedAt`.

The web showed two places to write a note. And once comments and dates move out,
`Application` is a 1:1 table with three fields and no life of its own.

## Decision

- **One table, `Vacancy`** (renamed from `EstimatedVacancy`). It holds:
  - the analyzer's fields, written once;
  - the current state: `status`, `statusChangedAt`, `salaryInListing`,
    `usedTailoredResume`.

  `Application` is merged into it and dropped.
- **One status enum, `VacancyStatus`:** `NOT_REVIEWED`, `SAVED_FOR_LATER` (was
  `READY_TO_APPLY`), `DECLINED`, then the pipeline: `APPLIED`, `RECRUITER_SCREEN`,
  `REPLIED`, `INTERVIEW`, `OFFER`, `REJECTED`. `/applications` is the vacancies whose
  status is in the pipeline.
- **`StatusChange`** `(vacancyId, status, createdAt)` is the journal. Every change of
  status is one row, and its `createdAt` is the only date of that change. The "applied
  date" is the date of the latest `APPLIED` row. `Vacancy.status` / `statusChangedAt` are
  a cache of the latest row. One function, `writeStatus`, writes the row and the cache in
  one transaction. Every write is an event, the status the vacancy already has included
  (the next interview round), so a caller writes once per real event.

  *Amended in phase 4.2 step 7:* only a **pipeline** repeat is an event. A **triage**
  status the vacancy already has (`TRIAGE_STATUSES` in `status.ts`) carries none, so
  `writeStatus` refuses it — `SameStatusError`, a `DomainError` (API 422, MCP `isError`)
  — and writes nothing. The web does not offer a row's current status.
- **`Comment`** `(vacancyId, source, body, createdAt)` holds every note. `source` is
  `ANALYZER | USER | AGENT`. Comments are append-only; a CRUD page may come later. The
  analyzer still sends `estimationComment`, and vacancy reads still return it, derived from
  the `ANALYZER` row.

The rule behind the split: a fact with one value per vacancy is a column; a fact with
many values is a 1:N table.

## Why this and not the alternatives

- **Keep `Application` as a 1:1 table.** It would keep a join on every `/applications`
  read, the `@unique` guard and `ApplicationAlreadyExistsError`, all for three columns. A
  1:1 split pays for itself only for a large optional column group, different access
  rights, or a hot write path, and none of these applies here.
- **Two history tables, or one with two nullable status columns plus a CHECK.** The two
  enums were one lifecycle cut at `APPLIED`. Merging them makes the history one column.
- **Derive the current status from the journal instead of caching it.** Every list filter,
  the timeout rule and the `/applications` sort would then need "latest row per
  vacancy" subqueries. Prisma cannot express those, so it would mean raw SQL. The cache is
  written only by `writeStatus`, so it cannot drift.
- **Keep `userComment` as an editable field** (ADR-0028's choice). That left two places to
  write a note. The edit modal now takes an empty "add a comment" field instead.

## Consequences

- Timeout (ADR-0022) and the `/applications` sort both read `statusChangedAt`, the last
  status move. For `APPLIED` that is the day of applying.
- `list_applications`' `id` is the vacancy's id.
- MCP has one `update_vacancy_status` in place of two status tools.
- Invariant 9 (Application 1:1) is gone. Invariant 3 becomes "`recommendation` is the
  analyzer's; `status` is the user's".
- The migrations are hand-written (renames and backfills). A non-empty
  `prisma migrate diff` after them is a bug.

## What this constrains — breaks if you change it

- Writing `status` anywhere but `writeStatus` → the cache and the journal disagree, and
  timeout and sort read the wrong date.
- Adding a `VacancyStatus` value → the Prisma enum, `PIPELINE_STATUSES` in core, the MCP
  zod enums, the API DTOs, and the web status schemas and label maps (no single source,
  ADR-0012).
- Writing a comment without a `source` → the web cannot colour it, and `/vacancies` cannot
  find the analyzer's comment.

## Related

[ADR-0019](0019-record-or-create-vacancy.md) (record-or-create, still holds),
[ADR-0022](0022-timeout-derived-until-scheduled.md) (timeout rule),
[ADR-0012](0012-web-hand-written-contract.md), [phase 3.1](../phases/phase-3.1.md).
