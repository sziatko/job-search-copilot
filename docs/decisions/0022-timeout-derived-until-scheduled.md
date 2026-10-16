# 0022 — Timeout is derived in `core`, not stored

- Status: Accepted · Date: 2026-09

## Context
`/applications` and the dashboard must show the applications that went quiet. Two
facts shape the choice: `Vacancy.statusChangedAt`, the date of the last move, is
always set; and nothing in the stack runs on a clock. A status the user sets by hand
("no response") is the step nobody does on a real backlog.

## Decision
**Timeout is derived, never stored.**

- `REJECTED` and `OFFER` are *closed*: outcomes, not stalls.
- Of the rest, one whose `statusChangedAt` is more than `TIMEOUT_DAYS` (30) ago is a
  *timeout*; the remainder is *active*. The window floats: from applying while
  `APPLIED`, from the interview after `INTERVIEW`.
- So `total = active + timeout + rejected + offer`, no overlap, no remainder: a broken
  rule shows in numbers that stop adding up.
- The rule lives once, in `packages/core/src/domain/status.ts`: `TIMEOUT_DAYS`,
  `timedOutWhere` / `activeWhere` (a Prisma `where`) and `isTimedOut` (a predicate).
  `StatsService` counts with it (`GET /stats`' `pipeline`); `ApplicationService.list`
  filters with it (`state=active|timedOut`) and flags each item `timedOut`.

## Why this and not the alternatives
- **A status set by hand** — the dates were already there; the manual step was the
  part nobody did.
- **A stored `TIMEOUT` status with no writer yet** — two sources of truth for one fact:
  a row could be `TIMEOUT` and "moved two days ago".
- **A scheduled sweep** — needs a scheduler the stack does not have. Adding an enum
  value later is one `ALTER TYPE … ADD VALUE`.

## Consequences
- No column, no job. The web reads `timedOut` and the counts; it has no copy of the
  rule.
- The threshold is a constant. A per-user setting would be the moment to revisit.

## What this constrains — breaks if you change it
- A stored `TIMEOUT` written while this rule exists → the row counted twice, or the
  two disagree. Add the value and remove the rule in one change.
- A sweep writing `TIMEOUT` through `writeStatus` stamps `statusChangedAt`: right for a
  stored status, but this rule would then read the row as "moved today".
- Timeout on `updatedAt` instead of `statusChangedAt` → a salary or CV edit would
  un-stale a row. A comment or an edit never moves `statusChangedAt`.

## Related
[ADR-0029](0029-one-vacancy-table.md), [ADR-0031](0031-stats-endpoint.md),
[`../domain-model.md`](../domain-model.md) § StatusChange.
