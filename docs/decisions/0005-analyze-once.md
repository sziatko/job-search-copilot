# 0005 — Analyze-once: an analysis is written once, never overwritten

- Status: Accepted · Date: 2026-09

## Context
An upsert by `applyUrl` would let a re-run of the analyzer, with worse or empty data,
silently overwrite a stored analysis, with no history. The owner's rule: a vacancy
already analysed is not written again.

## Decision
The analysis (`matchScore`, `recommendation`, the `ANALYZER` comment) is written once,
by one function, `writeAnalysis` (`vacancy.service.ts`): a conditional write
`WHERE recommendation IS NULL` first, which also takes the row lock.

`save()` is **create-if-absent** by the user's `applyUrl`:

- no row → create it, write the analysis (`created: true`);
- a row without an analysis (intake took it in, [ADR-0033](0033-unscored-vacancies-in-one-table.md))
  → attach this one (`attached: true`);
- a row with one → return it untouched (both `false`);
- a lost race on `create` (`P2002`) → re-read and resolve to the winner.

`submitAnalysis` on an analysed row throws `AlreadyAnalysedError`.

Over the transports:

- **REST** — `POST /api/v1/vacancies` → `201 Created` + `Location` when created, `200`
  otherwise. A `POST`: the id is server-assigned, so there is no URI to `PUT` to.
- **MCP** — `save_vacancy` answers `success: created || attached`, so the caller
  knows whether its analysis was stored.

## Why this and not the alternatives
- **Upsert** — the data loss above.
- **An analysis-history table** — full audit, but more schema and queries than a tool
  that analyses each posting once needs.
- **`PUT /vacancies/by-url/{encoded}`** — the purest idempotent-by-key verb, but an
  encoded URL in the path is not worth it; and an always-`200` drops the signal the
  MCP caller needs.

## Consequences
- A re-run of the analyzer is a cheap no-op.
- `updatedAt` moves only on the user's changes; the date of a move is
  `statusChangedAt`.
- The `(userId, applyUrl)` unique constraint is the real guard.

## What this constrains — breaks if you change it
- `save()` back to an upsert → stored analyses get clobbered; the `200` branch and
  `success` lose their meaning; the "second save leaves it untouched" tests in
  `vacancy.service.spec.ts` and `server.spec.ts` fail.
- `save()` returning a bare vacancy → the controller cannot choose `201` / `200`.
- Dropping `Location` on create → `apps/api/test/vacancies.e2e.spec.ts`.

## Related
[`../domain-model.md`](../domain-model.md) § Analyze-once,
[ADR-0033](0033-unscored-vacancies-in-one-table.md).
