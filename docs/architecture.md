# Architecture

## What the system is

A personal job-search tool. Vacancies come in unscored (n8n workflows through
`POST /vacancies/intake`, or Claude saving one) and are analysed **elsewhere** — by
Claude over the MCP tools, driven by the owner's skills, which are not part of this
repo — producing a match score, a recommendation, and reasoning. This repo is the
plumbing around that output: somewhere to store each vacancy, and a UI to work
through them from *new* to *applied* or *declined*, then through the pipeline.

Several users in one database, each signed in with Google / LinkedIn / a passkey and
seeing only their own vacancies ([ADR-0038](decisions/0038-multi-user-shared-schema.md));
sign-up is limited to an allowlist. Local-first: Docker Compose on a laptop, Postgres
in a container.

## The four packages

```
packages/core   ── domain layer: Prisma schema/client, the services,
                   the status rules, auth, DomainError types.
                   Framework-agnostic — no @nestjs/*, no MCP SDK.
      ▲     ▲
      │     └───────────────┐
apps/api (NestJS REST)      apps/mcp (MCP server, stdio + HTTP)
      ▲                            ▲
      │ HTTP /api/v1               │ stdio (per Claude Desktop session), or
      │                            │ Streamable HTTP /mcp + an OAuth token from api
apps/web (React SPA)        Claude (the owner's skills)
```

| Package | Responsibility | Depends on |
| --- | --- | --- |
| [`packages/core`](../packages/core/README.md) | The only database client. The schema and migrations; `VacancyService`, `ApplicationService`, `VacancyIntakeService`, `StatsService`; `writeStatus`, the only writer of status; the timeout rule; the `DomainError`s; Better Auth and API keys. | `@prisma/client`, `pg`, `better-auth` |
| `apps/api` | Thin NestJS transport over the core services, for the web app and n8n: DTO validation, versioned routes, a health check. | `core`, `@nestjs/*`, `class-validator` |
| `apps/mcp` | Thin transport over the *same* services, as tools for Claude ([ADR-0010](decisions/0010-mcp-server-factory.md)). One `createServer()`, two entrypoints: `src/index.ts` (stdio, as the owner of `JSC_API_KEY`) and `src/http.ts` (Streamable HTTP, an OAuth 2.1 resource server or an API key — [ADR-0035](decisions/0035-mcp-over-http-oauth-resource-server.md), [ADR-0039](decisions/0039-api-keys-per-user.md)). | `core`, `@modelcontextprotocol/sdk`, `express`, `jose`, `zod` |
| `apps/web` | React SPA in an app shell, routed by `@tanstack/react-router`: `/` dashboard, `/vacancies`, `/applications`, `/inbox`, `/profile` ([ADR-0024](decisions/0024-web-shell-and-theme.md)). Talks to `apps/api` only, through its **own** hand-written schema of the API — it never imports `core`. | `react`, `@tanstack/react-query`, `@tanstack/react-router`, `zod` |

Rationale for this split: [ADR-0001](decisions/0001-monorepo-npm-workspaces.md)
(monorepo), [ADR-0002](decisions/0002-core-shared-domain-layer.md) (core as the
shared domain layer), [ADR-0004](decisions/0004-one-service-two-transports.md) (two
transports over one service).

### Inside `packages/core/src`

Folders by feature, as `apps/api` is laid out. One public surface: `src/index.ts`,
which is all the apps import (`@job-search-copilot/core`); no folder has an index of
its own.

```
src/
  index.ts           the package's exports
  db/                Prisma client, forUser scoping, paging, LIKE escaping
  domain/            rules shared by more than one feature: errors, status (writeStatus,
                     the timeout rule), recommendation, url, identity, company, comments
  vacancies/         VacancyService and its types
  applications/      ApplicationService and its types
  intake/            VacancyIntakeService and its input
  stats/             StatsService
  auth/              Better Auth, API keys
  seed/              the made-up seed and resetToSeed
```

A new file goes into the folder of the one feature that uses it; once a second feature
needs it, into `domain/`; plumbing over Prisma with no domain meaning, into `db/`. A
spec sits next to its file; `isolation.spec.ts`, across every service, stays at the
root.

## Request lifecycles

**Analyzer saves a vacancy** (the write path):

```
Claude analyses a vacancy (a skill, not in this repo)
  → calls MCP tool save_vacancy (apps/mcp/src/vacancies/vacancies.tools.ts)
  → VacancyService.save()  (packages/core)
      → findUnique by applyUrl
          → analysed?    return { created: false, attached: false, vacancy }   (analysis discarded)
          → unanalysed?  writeAnalysis() → { created: false, attached: true, vacancy }
          → new?         create (NEW) → writeAnalysis() → { created: true, attached: false, vacancy }
  → tool returns { success: created || attached, vacancy: { id, company, title } } as JSON text

The analysis queue: list_vacancies({ status: ['NEW'], hasText: true })
  → get_vacancies_batch → submit_analyses_batch → VacancyService.submitAnalyses()
      → writeAnalysis() per item, one transaction
```

**User works through the list** (the read/update path):

```
apps/web  useVacancies()  (TanStack Query)
  → GET  /api/v1/vacancies?limit=100        → VacancyService.list()
  → PATCH /api/v1/vacancies/:id/status     → VacancyService.updateStatus() → writeStatus()
        (optimistic cache update in the hook; rollback on error; invalidate on settle)
```

**User records an application**:

```
apps/web  ApplyDialog "mark as applied"  →  POST /api/v1/applications { vacancyId, ... }
apps/mcp  record_application { company, title, ... }
  → ApplicationService.record()   (packages/core, one transaction)
      → resolve the vacancy: link by id / link to a unique (company,title) match /
        create a placeholder Vacancy (no text; an analysis only if a score was passed)
      → already in the pipeline? AlreadyAppliedError
      → writeStatus(APPLIED), then writeStatus(status) if recorded further along
        (each a StatusChange row + the status / statusChangedAt cache)
      → set salary / tailored-CV flag; add the comment as a USER Comment
  → returns { application, resolution, vacancyCreated }   (the vacancy, as /applications reads it)
```

Both transports call the same core service methods; there is no business logic in
`apps/api` or `apps/mcp` beyond input validation and shaping the response. See
[`contracts.md`](contracts.md) for the exact surfaces.

In `apps/web`, `src/lib/` holds what every page shares: the HTTP helper (`api.ts`:
`apiFetch`, `parseResponse`, `cursorPageSchema`), the cursor-paged query
(`useInfiniteList.ts`, [ADR-0030](decisions/0030-cursor-paging.md)) and each route's
title (`routeMeta.ts`). Presentational pieces are in `src/components/ui/`, the shell in
`src/components/RootLayout.tsx` + `src/components/shell/`.

## Dev stack (Docker Compose)

`docker-compose.yml` runs: `postgres`, a `core` build watcher (`tsc --watch`),
`api`, `mcp`, `mcp-http`, `web`. One more, `visual`, starts only on
`npm run test:visual`: the visual tests in the Playwright image
([ADR-0037](decisions/0037-e2e-playwright.md)).

- **File watchers poll.** Bind-mount change events don't reliably reach containers
  on Windows/Docker Desktop, so `tsc --watch`, `nest start --watch`
  and Vite are all told to poll (`CHOKIDAR_USEPOLLING`, `server.watch.usePolling`).
  > **Breaks if you change it:** dropping the polling env vars → edits on a Windows
  > host stop triggering rebuilds/HMR in the containers.
- **`mcp` idles** on `sleep infinity`. Creating a fresh container on Docker
  Desktop/Windows takes 15–20s — too close to Claude's ~30s MCP connect timeout.
  A session `docker exec`s into the already-running container and starts its own
  `npm run dev:mcp`.
  > **Breaks if you change it:** giving `mcp` a real long-running `command` →
  > only one MCP session at a time, and `docker exec`-based session startup no
  > longer applies.
- **`mcp-http` is MCP over HTTP** on port 3001 (`npm run dev:http`), a service of its
  own so a crash there never touches stdio. It fetches the API's JWKS at
  `AUTH_URL=http://api:3000` — inside a container `localhost` is the container — while
  the tokens' issuer stays `${BETTER_AUTH_URL}/api/auth`, the public URL.
- **The apps don't watch `core`'s `dist/`.** They run `core`'s compiled output, and
  their watchers don't see it change ([ADR-0003](decisions/0003-core-consumed-as-dist.md)).
- **Healthchecks gate startup.** `api` and `mcp` wait for `postgres`'s `pg_isready`;
  `web` waits for `api`'s `/health` ([ADR-0016](decisions/0016-docker-dev-stack-and-ci.md)).
- **Each service has its own `node_modules` volume**, not shared, and `core`, `api`,
  `mcp` and `mcp-http` regenerate the Prisma client into theirs on start.

So, after a change to:

- `packages/core` code or `schema.prisma` (a migration included) →
  `docker compose restart core api mcp mcp-http`. A missed regeneration shows as an
  `@IsEnum(<NewEnum>)` DTO crashing on boot, or a 400 / 500 on a new enum value.
- a dependency → `docker compose up -d --build`, then `docker compose up -d -V`: a
  recreated container keeps its old anonymous `node_modules` volume unless `-V`
  renews it.

## System invariants

The load-bearing assumptions. Each links to the section or ADR that owns it.

1. **`packages/core` is the only database client.** `apps/api` and `apps/mcp`
   reach the DB *only* through `core`'s services. A
   query written in a controller or a tool handler is a bug. Auth is the one other
   door: the Better Auth instance `createAuth` builds in `core` on `core`'s client; the
   apps mount it, never build their own.
   → [ADR-0002](decisions/0002-core-shared-domain-layer.md),
   [ADR-0034](decisions/0034-auth-better-auth-in-core.md)
2. **A vacancy is analysed once.** A vacancy can exist before its analysis (status
   `NEW`, `matchScore` and `recommendation` both `null`); the analysis is written once
   and never overwritten — `writeAnalysis` in `vacancy.service.ts` (`save()`,
   `submitAnalysis`) is a conditional write (`recommendation IS NULL`), and `record()`
   writes one only on the vacancy it creates; `save()` returns an analysed row for a
   given `applyUrl` untouched, `submitAnalysis` refuses one (`AlreadyAnalysedError`).
   Both fields or neither, and never on a `NEW` row: two DB CHECKs.
   Anything that expects re-analysis to update stored fields is wrong.
   → [ADR-0005](decisions/0005-analyze-once.md),
   [ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md),
   [`domain-model.md`](domain-model.md)
3. **`recommendation` is the analyzer's; `status` is the user's.** They are
   independent axes and neither is derived from the other, and they have disjoint
   writers: `save()` / `submitAnalysis()` (through `writeAnalysis`) and `record()`'s
   create-vacancy path write the analysis fields
   (and a new vacancy's first `NEW`); `writeStatus()` alone writes `status`
   + `statusChangedAt` and the `StatusChange` journal, in one transaction. **One
   exception:** the analysis moves a vacancy out of `NEW`, through `writeStatus()` in
   the transaction that writes it — `SKIP` → `FILTERED_OUT`, else `NOT_REVIEWED`
   (`statusAfterAnalysis`, in `core`, never in an agent). Only from `NEW`, so it never
   clobbers the user's progress.
   → [`domain-model.md`](domain-model.md),
   [ADR-0029](decisions/0029-one-vacancy-table.md),
   [ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)
4. **`recommendation` is stored canonical-English.** Only the English enum is
   accepted on the way in (`parseRecommendation`, the MCP and REST validators). Every
   filter/enum downstream assumes English. → [`domain-model.md`](domain-model.md)
5. **The web app's API contract is a hand-written zod schema**, not a `core`
   import. `core` pulls in Prisma/pg and must never enter the browser bundle.
   → [ADR-0012](decisions/0012-web-hand-written-contract.md)
6. **`apps/api` disables Biome's `useImportType`.** NestJS DI + `class-validator`
   need types used in decorated positions to be *runtime* imports. Turning the
   rule back on silently breaks DI. → [ADR-0014](decisions/0014-biome-and-nest-di-import-type.md)
7. **Tests run against a real `job_search_copilot_test` database**, sequentially
   (`fileParallelism: false`), and are integration tests, not Prisma mocks.
   → [ADR-0015](decisions/0015-testing-strategy.md)
8. **Env is loaded by the app entrypoint, validated at boot.** `packages/core`
   does not load `.env`; a missing/invalid var fails startup with a readable
   message. → [ADR-0007](decisions/0007-env-config-and-loading.md)
9. **Every REST route is closed by default.** A global guard
   wants a session; anonymous access is explicit (`@AllowAnonymous()`, `/health` only),
   machine access is explicit (`ApiKeyGuard`, the three n8n routes only).
   An anonymous route has no user to scope its queries to (invariant 11).
   → [ADR-0034](decisions/0034-auth-better-auth-in-core.md),
   [ADR-0039](decisions/0039-api-keys-per-user.md)
10. **No real job-search data in the repo.** The repo is public; the dev DB holds the
    owner's real search. Code, tests, fixtures, docs and commit messages use made-up
    companies, ids, rates and counts (`Acme`, `3912345678`, `100 PLN/h`), never ones
    copied from the dev DB, a log or a mailbox. Git keeps what was ever committed, so a
    leak means rewriting history. The owner's personal skills, which do hold real data,
    live in a separate private repo cloned into the gitignored `skills/`.
11. **Every domain query is scoped to its user.** `Vacancy`
    has a `userId`; core's services take it as their first argument and query only
    through `forUser(db, userId)`, which adds the owner to every `Vacancy`, `Comment`
    and `StatusChange` query. A query on the raw client reads every user's rows; another
    user's row answers like a missing one (404, never 403).
    → [ADR-0038](decisions/0038-multi-user-shared-schema.md),
    [ADR-0039](decisions/0039-api-keys-per-user.md)

## Stack

Node 24 · PostgreSQL 17 · Prisma 7 · NestJS 12 · React 19 · Vite · Vitest 5 ·
Biome 2 · `@modelcontextprotocol/sdk` 1 · `@tanstack/react-query` 5 ·
`@tanstack/react-router` 1 · zod 4.
