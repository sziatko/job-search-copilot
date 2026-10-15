# 0038 — Multi-user: one schema, `userId` on `Vacancy`, every query through `forUser`

- Status: Accepted · Date: 2026-10

## Context
Several users sign in ([ADR-0034](0034-auth-better-auth-in-core.md)), and each must see
only their own vacancies, comments, status journal and stats. Core holds a few dozen
Prisma calls, and several write before they check (`writeStatus` in `updateStatus`), so
one forgotten filter would let a user change another's row and then answer 404.

## Decision
One database and one schema; `Vacancy.userId` → `User` (`onDelete: Cascade`),
`@@unique([userId, applyUrl])`, `userId` leading the list indexes. `Comment` and
`StatusChange` are scoped through their vacancy. Public service methods take `userId`
as the first argument; inside core every query goes through `forUser(db, userId)`, a
Prisma `$extends` client that adds `userId` to `Vacancy` reads, updates and deletes,
`vacancy: { userId }` to `StatusChange` and `Comment` queries, requires `userId` on a
create, and throws on an operation it does not know. Another user's row answers like a
missing one: `null` in core, 404 over REST, not-found over MCP. Sign-up stays limited
to `AUTH_ALLOWED_EMAILS`.

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
- A forgotten filter is not possible inside core, short of bypassing `forUser`. A test
  scans `src/` and keeps `this.db.vacancy` / `tx.vacancy` out of the services
  (`for-user.spec.ts`); `isolation.spec.ts` runs every public method as another user and
  checks the owner's rows are untouched.
- `forUser` covers `Vacancy`, `Comment` and `StatusChange` only. A nested relation from
  another model (`user.findUnique({ include: { vacancies } })`) is outside it.
- Ids stay sequential integers, so they hint at the total row count across users.
  Acceptable for allowlisted accounts.
- Deleting a user deletes their vacancies, comments and journal.

## What this constrains — breaks if you change it
- A query on `Vacancy`, `Comment` or `StatusChange` on the raw client (not `forUser`)
  reads every user's rows. The scanning test is the guard: it reads files from disk, so
  a moved folder can silently shrink what it scans — check its count after a move.
- A raw SQL query (`$queryRaw`) is outside `forUser`: it must filter by `userId` itself.
- `applyUrl` is unique per user, not globally: a lookup by `applyUrl` alone
  (`findUnique({ where: { applyUrl } })`) no longer compiles, and must not come back.
- The allowlist is checked on sign-up only (`user.create.before` in `create-auth.ts`).
  Removing an email does not lock out an existing account; deleting the user does.
- Answering 403 or 409 on another user's id leaks that the id exists.

## Related
[ADR-0002](0002-core-shared-domain-layer.md), [ADR-0034](0034-auth-better-auth-in-core.md),
[ADR-0039](0039-api-keys-per-user.md).
