# 0028 — Application comments are rows in a `Comment` table, replacing `statusComment`

- Status: Accepted
- Phase: 3   ·   Date: 2026-09

## Context

`Application.statusComment` is a single text column. Each `updateStatus()` call with a
note appends to it as `"a / b / c"`, and the schema comment called it the "simplest
thing that works — revisit as a real history table if that's ever not enough". It is
not enough now:

- the user wants to add a note to an application at any time (after an interview, for
  example), not only alongside a status change;
- each note should show when it was written.

## Decision

A `Comment` table: `id`, `createdAt`, `body @db.Text`, and
`applicationId → Application` (`onDelete: Cascade`), indexed by
`(applicationId, createdAt)`.

- Comments are **append-only**. There is no edit and no delete in any surface.
- The migration splits each existing `statusComment` on `" / "` into rows, stamped with
  that application's `statusUpdatedAt` (the only date there is), and drops the column.
- `updateStatus()` inserts a row instead of appending text.
- `ApplicationListItem` carries `comments: { id, createdAt, body }[]`, oldest first, in
  place of `statusComment`.

`userComment` is **not** moved. It stays a field on `Application`, written by the apply
modal, and the same modal re-opened for editing can now change it. It is "the note
about this application". Comments are "what happened since".

## Why this and not the alternatives

- **Named `Comment`, not `ApplicationComment`.** Comments on vacancies were discussed
  and deferred. A later nullable `estimatedVacancyId`, with a CHECK that exactly one FK
  is set, then needs no rename.
- **One polymorphic `(targetType, targetId)` column pair.** No foreign key, so no
  cascade and no integrity. Two nullable FKs keep both.
- **Move `userComment` into the table too.** Then editing the application's comment
  would mean editing a comment row, which contradicts append-only.
- **Keep `statusComment` and add the table beside it.** That leaves two places for the
  same kind of note, and the web would have to merge them forever.

## Consequences

- The split is lossy only where a note itself contained `" / "`: it becomes two rows.
  Nothing is dropped. The migrated rows carry an approximate date, the last status move.
- The contract changes on every surface. REST, MCP (`list_applications`) and the web's
  zod schema lose `statusComment` and gain `comments`. The web schema has to change in
  the same step, or `/tracker` fails to parse (invariant 5).

## What this constrains — breaks if you change it

- `apps/web/src/pages/applications/types.ts` and the MSW fakes mirror
  `ApplicationListItem.comments`. The hand-written contract (ADR-0012) does not follow a
  core change on its own.
- `MergedComment` renders in the order userComment → analyzer comment → comments.

## Related

[ADR-0017](0017-application-1to1-delta.md), [ADR-0012](0012-web-hand-written-contract.md),
[`../phases/phase-3.md`](../phases/phase-3.md).
