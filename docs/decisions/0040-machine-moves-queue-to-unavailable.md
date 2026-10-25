# 0040 — A machine moves only the queue, to UNAVAILABLE

- Status: Accepted · Date: 2026-10

## Context
A posting closes while it waits in the user's queue, and the user finds out only by
opening it. n8n can check each queued posting on its site (LinkedIn, JustJoin, No Fluff
Jobs) once a day. But `status` is the user's (invariant 3): a machine that writes it
must not undo what the user decided since n8n read the list, and must not be able to
set anything else.

## Decision
`POST /vacancies/unavailable`, `{ items: [{ id, reason }] }`, 1–100, a session or an
API key ([ADR-0039](0039-api-keys-per-user.md)). One transaction:
`VacancyService.markUnavailable` moves a vacancy still in the queue — `NEW`,
`NOT_REVIEWED`, `SAVED_FOR_LATER` — to `UNAVAILABLE`, with `reason` as a comment (`AGENT`
from a key). Any other id is skipped and left untouched: one the user moved since, one
already `UNAVAILABLE`, an unknown or another user's. The answer is
`{ moved: id[], skipped: id[] }`, never a 404 or a 409.

The guard is `writeStatus`'s optional `from`: the status check is in the same `UPDATE`
that moves the row, so a move the user makes between n8n's read and this write wins.

## Why this and not the alternatives
- **The key on `PATCH /vacancies/:id/status`** — it takes any status from any status:
  n8n would overwrite a `DECLINED` or an `APPLIED` made after its read, and a bug in a
  workflow could write anything. A route of its own allows one move, only from the queue.
- **n8n reads each status again before it writes** — a race between the read and the
  write, and N more requests.
- **Delete closed postings** — loses the record that the posting was seen; the journal
  and `/stats` count it.
- **One request per posting** — up to a hundred requests a day, each its own
  transaction; a batch is one.

## Consequences
- A second machine writer of `status`, beside the analysis's move out of `NEW`
  (invariant 3) — and like it, only from statuses the user has not acted on.
- n8n needs no idea of the user's statuses: it sends what it found closed and reads
  `skipped` for what it no longer owns.
- A skipped id carries no reason — moved by the user, unknown and another user's look
  the same, so a key learns nothing about rows it does not own.

## What this constrains — breaks if you change it
- Widening `OPEN_QUEUE` (`vacancy.service.ts`) to a pipeline status lets n8n end an
  application the user is still in.
- `writeStatus`'s `from` must stay in the `UPDATE`'s `where`: a read-then-write check
  reopens the race.
- The route's body or answer → the n8n workflow (outside the repo) and
  `apps/api/test/vacancies.e2e.spec.ts`.

## Related
[ADR-0029](0029-one-vacancy-table.md), [ADR-0033](0033-unscored-vacancies-in-one-table.md),
[ADR-0039](0039-api-keys-per-user.md); `writeStatus` in `core/src/domain/status.ts`.
