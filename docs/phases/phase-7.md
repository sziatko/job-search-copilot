# Phase 7: multi-user — every row has an owner, API keys per user

## Goal

Phase 6 put sign-in in front of everything, but the data still has no owner:

- **Every signed-in account sees all the data.** `Vacancy` has no `userId`; the
  `AUTH_ALLOWED_EMAILS` allowlist is the stopgap ([ADR-0034](../decisions/0034-auth-better-auth-in-core.md)).
- **n8n writes with one static `INTAKE_TOKEN`** that has no user behind it
  (ADR-0036, deleted in step 2).
- **The stdio MCP has no auth and no user** ([ADR-0035](../decisions/0035-mcp-over-http-oauth-resource-server.md)).

This phase makes every vacancy belong to an account and gives each user API keys, so
n8n and MCP act **as that user**. The schema was built single-user, so the risk is a
query that forgets the owner, not the schema change itself — the phase is built
around making that mistake impossible rather than silent
([ADR-0038](../decisions/0038-multi-user-shared-schema.md)).

Decided with the user on 2026-10-11 (the plan was reviewed by an independent agent the
same day; its findings are folded in):

- **One DB, `userId` on `Vacancy`.** `Comment` and `StatusChange` are scoped through
  their vacancy. The existing data migrates to the owner's account; a second account
  signs in to an empty app. The allowlist stays: no open sign-up.
- **Isolation is enforced in one place.** Public service methods take `userId` first;
  inside core, every query goes through `forUser(db, userId)` — a Prisma `$extends`
  client that adds the owner to every query and throws on an operation it does not
  know. Another user's row is a **404**, never a 403.
- **API keys per user** ([ADR-0039](../decisions/0039-api-keys-per-user.md)),
  Better Auth's `@better-auth/api-key` plugin, prefix `jsc_`, managed on `/profile`. A
  key opens MCP and the three machine REST routes (`POST /vacancies/intake`,
  `/vacancies/analysis`, `/vacancies/:id/analysis`); no REST reads, no per-key scopes.
  A key is full access to its owner's data through MCP — that is the boundary.
- **MCP**: HTTP accepts an OAuth token (claude.ai) **or** `Authorization: Bearer jsc_…`
  (Claude Desktop / Code through `mcp-remote --header`, scripts). stdio reads
  `JSC_API_KEY` and verifies it at boot — identity, not security: whoever runs stdio
  holds `DATABASE_URL`.
- **n8n** keeps `Authorization: Bearer <…>`; only the value changes, to a key.
- MCP tool names and fields do not change: `skills/` is untouched, nothing to re-upload.

## What the steps rely on (checked 2026-10-11)

- `@better-auth/api-key`: the key's owner is **`referenceId`** (not `userId`); keys are
  stored hashed; `auth.api.verifyApiKey({ body: { key } })` → `{ valid, error, key }`.
  Its rate limit is **on by default at 10 requests a day**, and the limit is copied
  onto each key when it is created → `rateLimit: { enabled: false }` from the first
  key. `enableSessionForAPIKeys` stays off (it would let a key into every REST route).
- `betterAuth()` throws in production without a `secret`, and the MCP env has none.
- The MCP SDK's `requireBearerAuth` rejects an `authInfo` without a numeric
  `expiresAt` (`@modelcontextprotocol/sdk/dist/esm/server/auth/middleware/bearerAuth.js:46`);
  a key never expires.
- Sites that leak if the owner filter is missed — most write before they check:
  - `VacancyService.updateStatus`: `writeStatus` (`vacancy.service.ts` ~439) runs before
    the read that would return null.
  - `writeAnalysis`'s `count({ id })` (~193): 409 against 404 tells B that A's id exists.
  - `updateRow` (`application.service.ts` ~83): the same write-first shape.
  - `intakeOne`'s `(companyKey, titleKey)` fallback (`vacancy-intake.service.ts` ~98):
    B's posting would be called a duplicate of A's, and B would never get it.
  - `companyMatchCounts` (~141): A's counts in B's list.
  - `StatsService`'s recent activity reads `statusChange` directly (`stats.service.ts` ~103).
  - `resetToSeed` reads back the new ids unscoped (`reset-to-seed.ts` ~42).

## Steps

**1 · API keys exist.** `@better-auth/api-key` in `core`, `apiKeyClient` in `web`.
`apiKey({ defaultPrefix: 'jsc_', rateLimit: { enabled: false } })` in `createAuth`,
from one options const. The `apikey` table and its migration. Core exports
`verifyApiKey(prisma, key) → userId | null`: a verify-only Better Auth instance with the
same options const and `secret: randomBytes(32)` (it signs nothing), so the MCP needs no
Google secrets — validate this first, it is the step's one unknown. `/profile` gets an
"API keys" card built like the Passkeys card: create (a name → the key shown once, with
Copy), the list (name, prefix, created, last used), Revoke. Tests: core (create → verify
→ owner; revoked and garbage → null; it boots with `NODE_ENV=production`), web (the
card, MSW). e2e: the `/profile` spec gains create, list, revoke.

**2 · Every entry knows its user.** No data scoping yet: the user is resolved and
carried to where step 3a will use it.
- API: `ApiKeyGuard` replaces `MachineTokenGuard` on the three routes — a session
  passes; else `Bearer` → `verifyApiKey`; else 401. A `@CurrentUserId()` param
  decorator (the session's user or the key's owner). `INTAKE_TOKEN` leaves the env
  validation, `.env.example`, `docker-compose.yml`, `ci.yml` and `e2e/`; ADR-0036 is
  deleted and its links fixed. Swagger: `addBearerAuth` on the three routes
  (`setup-app.ts`).
- MCP: `createServer({ userId })`. The HTTP verifier: a `jsc_` bearer → `verifyApiKey`
  → `{ extra: { sub: userId }, expiresAt: now + 60 }`; anything else → the JWT path.
  Confirm the OAuth `sub` is the user id (a public subject type, not pairwise). stdio: a
  zod schema in `apps/mcp/src/env.ts` requiring `JSC_API_KEY` (invariant 8), and a
  clear boot error on an invalid key.
- Tests: api `auth.e2e.spec.ts` for keys (valid, revoked, none, a key on a REST read
  route → 401); mcp `http-app.spec.ts` (a key gets past `requireBearerAuth`, a bad key
  401, a JWT still works). README: the n8n credential is a key from `/profile` (intake
  fails between the deploy and the swap — acceptable); the stdio MCP gets `JSC_API_KEY`
  (in `.env`: Claude Desktop's config `env` stops at the host's `docker exec`).

**3a · Core: data belongs to a user.**
- Schema: `Vacancy.userId` → `User` (`onDelete: Cascade`); `@@unique([userId, applyUrl])`
  replaces `applyUrl @unique`; `userId` leads the `[companyKey, titleKey]`,
  `[status, statusChangedAt]` and `[recommendation]` indexes. No `userId` on `Comment`
  or `StatusChange`.
- Migration: the user-count check comes first — if vacancies exist and there is not
  exactly one user, `RAISE EXCEPTION` listing the users' emails and the
  `prisma migrate resolve` command to recover (two users happen when the Google and
  LinkedIn emails differ). Then a nullable column → backfill → `NOT NULL`. Drop stale
  `_test` / `_e2e` databases before migrating.
- `forUser` and its tests first: it applies inside `$transaction` callbacks, throws on
  an operation it does not know, and a create needs `userId`. Then every service onto
  it, `userId` the first argument of every public method; each site in the list above
  covered. `resetToSeed(prisma, userId)` scoped, its id read too. Callers (controllers,
  MCP tools, `e2e/global-setup.ts`) pass the user step 2 resolved; `npm run seed`
  (`scripts/seed.ts`) seeds as the first `AUTH_ALLOWED_EMAILS` user, upserted.
- Tests: a table-driven isolation test — every public method called as user B with A's
  id or data → null / not found, and A's row unchanged; one `applyUrl` for two users →
  two rows; B's list, stats, company history and intake duplicate check untouched by A.
  A grep test: `this.db.vacancy` / `tx.vacancy` appear nowhere outside `forUser`, and
  `this.db` only as `forUser(this.db, userId)` — so a scoped handle, a transaction's
  included, is named `db`, never `tx`.

**3b · Isolation end to end.** api: B gets a 404 on A's `GET` and `PATCH`; an intake with
B's key lands in B. mcp: a server for B does not see A's vacancy. e2e: a second account
signs in to an empty dashboard. The dev DB: `npm run migrate:dev`, then
`docker compose restart api mcp core`; every vacancy carries the owner's id, the web
shows the counts it showed before, stdio with the key lists the same vacancies.

**4 · Close-out.** `create-auth.ts`'s "stopgap" comment and ADR-0034's stopgap lines;
`contracts.md` (MCP auth, the machine routes); the backlog's Public demo row (the demo
user's `userId`); the Multi-user row → the archive. The full `npm test` and the full
`npm run test:e2e` before the PR. For the user, not code: create a key on `/profile`,
put it in n8n's credential and in `.env`'s `JSC_API_KEY` for the stdio MCP (or Claude
Desktop's config `env` plus `-e JSC_API_KEY` in its `docker exec` arguments).

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`, ADR-0038 and ADR-0039,
  ADR-0035's stdio line, invariant 11, the backlog's Multi-user row
  `planned (phase 7)`, phase 6's auth row archived. — *2026-10-11.* Docs only.
- [x] **1 · API keys exist.** — *2026-10-11.* The dev DB is not migrated: the API keys
  card fails there until `npm run migrate:dev` (migration `20261011120000_api_key`).
  `Apikey.referenceId` got a foreign key to `User` (cascade), which the plugin does not
  declare. Revoke is the plugin's delete, not `enabled: false`. The verifier logs a
  Better Auth `ERROR` for every rejected key and a "Base URL is not set" `WARN` once —
  noise, not failures.
- [x] **2 · Every entry knows its user.** — *2026-10-11.* `@CurrentUserId()` (in
  `api-key.guard.ts`) is on no route yet: 3a puts it on every controller method.
  `createServer` takes `userId` but drops it, and `server.spec.ts` passes a made-up
  `'user-1'` — 3a needs a real user row there. stdio now refuses to boot without a valid
  `JSC_API_KEY`: on the dev DB that needs `npm run migrate:dev` first (no `apikey` table
  yet) and a key in `.env`, the `mcp` container's `npm run dev:mcp` included. The local
  `.env` still carries an unused `INTAKE_TOKEN` (harmless; the user's file).
- [x] **3a · Core: data belongs to a user.** — *2026-10-11.* The dev DB is not migrated
  (migration `20261011130000_vacancy_owner`): the running `api` / `mcp` containers now
  run code that reads `Vacancy.userId`, so the dev app fails until 3b's
  `npm run migrate:dev` + restart. On ≠ 1 user with vacancies it refuses, naming the
  emails and the `migrate resolve` command (checked on a scratch DB, 0 and 2 users).
  Test helpers for 3b: core `tests/user.ts` `createUser()`; api `signIn()` returns
  `{ cookie, userId }` and `signedInAgent(app).userId`; mcp `server.spec.ts` acts as
  a real module-level user.
- [x] **3b · Isolation end to end.** — *2026-10-11.* Dev DB migrated (one user, every
  vacancy backfilled to it, status counts unchanged); the owner's stats and list read
  through core match the counts from before the migration. Not run: stdio with a real key,
  because it needs a key from `/profile`, which is step 4's user action. The new
  `@better-auth/api-key` dependency needed `npm install` inside every container
  (`core api mcp mcp-http web`), and only then the restart.
- [x] **4 · Close-out.** — *2026-10-11.* Left for the user: a key from `/profile` into
  n8n's credential and `.env`'s `JSC_API_KEY`, then the stdio check 3b skipped.
