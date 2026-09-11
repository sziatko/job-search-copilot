# 0017 — `Application` is a minimal 1:1 delta on `EstimatedVacancy`

- Status: Accepted
- Phase: 2   ·   Date: 2026-09

## Context

Phase 2 needs a per-application record: pipeline stage, salary in the listing,
tailored-CV flag, the user's own note. Most of what the `/tracker` page shows
(company, title, applyUrl, match score, recommendation, analyzer comment, date
analysed) already lives on `EstimatedVacancy`. The question was where the new
fields go and how the two rows relate — with a hard constraint that the ~230 rows
of the user's existing `tracker.md`, and most future "I applied to X" calls, refer
to vacancies that were **never analysed** (so no `EstimatedVacancy` row exists),
and `EstimatedVacancy.fullText` / `matchScore` / `recommendation` /
`estimationComment` are all `NOT NULL`.

## Decision

A new `Application` model with `estimatedVacancyId Int @unique` — a NOT NULL 1:1
foreign key (`onDelete: Cascade`). `Application` stores **only the delta**:
`status`, `statusUpdatedAt`, `salaryInListing`, `usedTailoredResume`,
`userComment`, `appliedAt`, `createdAt`, `updatedAt`. Everything else the tracker
displays is read from the linked `EstimatedVacancy` through a join
(`ApplicationService.list` / `.getById` flatten it into `ApplicationListItem`).
No column is duplicated onto `Application`. Every `Application` has a real
`EstimatedVacancy` row; a never-analysed one is created with placeholder analyzer
fields — [ADR-0019](0019-record-or-create-vacancy.md).

## Why this and not the alternatives

- **Snapshot company/title (+ applyUrl) onto `Application`, link optional.** Avoids
  forcing an `EstimatedVacancy` for un-analysed applications, but reintroduces
  duplication the user explicitly did not want, and lets the two rows' company /
  title drift apart. Rejected in favour of the strict join.
- **Make the four analyzer fields nullable so un-analysed applications get a bare
  `EstimatedVacancy`.** Zero duplication, but it changes the Phase 1 schema, the
  hand-written zod contract in three places (core types, MCP, web), and every
  Phase 1 read path / sort that assumes `matchScore` and `recommendation` are
  present — an ongoing tax on every future change. Rejected.
- **Fold everything into one table (no `EstimatedVacancy` link at all).** Loses
  the connection to the analyzer's output, which is the point of linking. Rejected.

## Consequences

- The `/tracker` query is `Application LEFT`-less `JOIN EstimatedVacancy` — the
  join is a primary-key lookup, not a filter; `status` / `search` (`company` OR
  `title` ILIKE) / `appliedAt` sort all run against indexed columns.
- The Phase 1 `EstimatedVacancy` schema and its zod contract are untouched.
- Re-applying to the *same analysed* vacancy is an error
  (`ApplicationAlreadyExistsError`) — a deliberate consequence of `@unique`. In
  practice tracker re-applies have distinct URLs and become distinct vacancy rows.

## What this constrains — breaks if you change it

- Adding a field the `/tracker` page needs from the vacancy → add it to
  `VACANCY_SELECT` + `flatten()` in
  [`packages/core/src/application.service.ts`](../../packages/core/src/application.service.ts)
  **and** `applicationListItemSchema` in
  [`apps/web/src/features/applications/types.ts`](../../apps/web/src/features/applications/types.ts)
  (parallel maintenance, same rule as [ADR-0012](0012-web-hand-written-contract.md)).
- Dropping the `@unique` on `estimatedVacancyId` → `record()`'s
  `ApplicationAlreadyExistsError` guard and its spec become dead; the 1:1 flatten
  assumption in `ApplicationListItem` no longer holds.
- Copying company/title onto `Application` after all → the "no duplication"
  premise here is void; add a reconciliation story for drift.

## Related

[ADR-0018](0018-application-status-separate-enum.md),
[ADR-0019](0019-record-or-create-vacancy.md),
[`../domain-model.md`](../domain-model.md) `## Application`.
