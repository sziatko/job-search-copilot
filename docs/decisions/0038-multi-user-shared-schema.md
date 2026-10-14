# 0038 — Multi-user: one schema, `userId` on `Vacancy`, every query through `forUser`

- Status: Accepted
- Phase: 7   ·   Date: 2026-10

## Context
The schema was built for one user. Phase 6 added sign-in, but `Vacancy` has no owner,
so every allowlisted account sees all the data ([ADR-0034](0034-auth-better-auth-in-core.md)).
A second user — a QA, say, with nothing in common with a frontend dev — must see only
their own vacancies, comments, status journal and stats. The data already in the dev
DB is the owner's. Core holds about 30 Prisma calls, and several write before they
check (`writeStatus` in `updateStatus`, `updateRow`), so a forgotten filter would let
one user change another's row and then answer 404.

## Decision
One database and one schema; `Vacancy.userId` → `User` (`onDelete: Cascade`),
`@@unique([userId, applyUrl])`, `userId` leading the list indexes. `Comment` and
`StatusChange` are scoped through their vacancy. Public service methods take `userId`
as the first argument; inside core every query goes through `forUser(db, userId)`, a
Prisma `$extends` client that adds `userId` to `Vacancy` reads, updates and deletes,
`vacancy: { userId }` to `StatusChange` and `Comment` queries, requires `userId` on a
create, and throws on an operation it does not know. Another user's row answers like a
missing one: `null` in core, 404 over REST, not-found over MCP. The migration moves the
existing rows to the one existing user and refuses to run if there is not exactly one.
Sign-up stays limited to `AUTH_ALLOWED_EMAILS`.

## Why this and not the alternatives
- **`userId` threaded by hand into every `where`** — the plainest code, but a missed
  filter fails nothing: the compiler checks the callers, not the queries inside core.
- **Postgres Row-Level Security** (`SET LOCAL app.user_id` per transaction) — the
  database itself refuses, raw SQL included. But the superuser the e2e and CI runs
  connect as bypasses it, Better Auth shares the client and must not be filtered, and
  every query would need a wrapping transaction next to the services' own. Kept as the
  next step if a raw-SQL path ever appears.
- **AsyncLocalStorage for the current user** — no argument to pass, but a hidden
  dependency in a framework-free core; the seed and the tests would need `run()`
  around every call.
- **A schema or a database per user** — real isolation, but migrations times N and
  cross-user nothing; for SaaS with a few large tenants, not for this.
- **`userId` on `Comment` and `StatusChange` too** — defence in depth, useful under RLS;
  through the vacancy relation is enough for `forUser`.
- **403 for another user's row** — tells the caller the id exists.

## Consequences
- A forgotten filter is not possible inside core, short of bypassing `forUser`; a grep
  test keeps `this.db.vacancy` / `tx.vacancy` out of the services.
- Every public method changes its signature once; the callers change mechanically.
- Ids stay sequential integers, so they hint at the total row count across users.
  Acceptable for allowlisted accounts.
- Deleting a user deletes their vacancies, comments and journal.

## What this constrains — breaks if you change it
- A query on `Vacancy`, `Comment` or `StatusChange` written on the raw client (not
  `forUser`) reads every user's rows. The grep test is the guard; do not loosen it.
- A raw SQL query (`$queryRaw`) is outside `forUser`: it must filter by `userId` itself.
- `applyUrl` is unique per user, not globally: a lookup by `applyUrl` alone
  (`findUnique({ where: { applyUrl } })`) no longer compiles, and must not come back.
- The allowlist is checked on sign-up only (`user.create.before` in `create-auth.ts`).
  Removing an email does not lock out an existing account; deleting the user does.
- Answering 403 or 409 on another user's id leaks that the id exists.

## Related
[ADR-0002](0002-core-shared-domain-layer.md), [ADR-0034](0034-auth-better-auth-in-core.md),
[ADR-0039](0039-api-keys-per-user.md), [`../phases/phase-7.md`](../phases/phase-7.md).
