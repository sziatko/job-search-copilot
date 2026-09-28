# Architecture

## What the system is

A personal job-search tool. Vacancies are analysed **elsewhere** — by the
`vacancy-match-analyzer` prompt, which is not part of this repo — producing a match
score, a recommendation, and reasoning. This repo is the plumbing around that
output: somewhere to store each analysed vacancy, and a UI to work through them
from *not reviewed* to *applied* or *declined*.

Single user (the user). No auth, no multi-tenancy. Local-first: Docker Compose on a
laptop, Postgres in a container.

## The four packages

```
packages/core   ── domain layer: Prisma schema/client, VacancyService,
                   recommendation normalization, DomainError types.
                   Framework-agnostic — no @nestjs/*, no MCP SDK.
      ▲     ▲
      │     └───────────────┐
apps/api (NestJS REST)      apps/mcp (MCP server, stdio)
      ▲                            ▲
      │ HTTP /api/v1               │ stdio (per Claude session)
apps/web (React SPA)        vacancy-match-analyzer
```

| Package | Responsibility | Depends on |
| --- | --- | --- |
| [`packages/core`](../packages/core/README.md) | The only place that talks to the database. Owns the schema (`Vacancy` with its `StatusChange` journal and `Comment`s, `VacancyLogEntry`) + migrations, the `VacancyService`, `ApplicationService` and `VacancyLogService` (all queries), `writeStatus` (the only writer of status), recommendation normalization, and the `DomainError` hierarchy. | `@prisma/client`, `pg` |
| `apps/api` | Thin HTTP transport over the core services for the web app. NestJS: DI, DTO validation, versioned routes (`vacancies`, `applications`), a health check. | `core`, `@nestjs/*`, `class-validator`, `zod` |
| `apps/mcp` | Thin stdio transport over the *same* services, exposing ten tools (4 for vacancies, 4 for applications incl. `update_vacancy_status`, 2 for the vacancy log — see [ADR-0010](decisions/0010-mcp-server-factory.md)) so Claude can save/query analysed vacancies and record/query applications directly. | `core`, `@modelcontextprotocol/sdk`, `zod` |
| `apps/web` | React 19 + Vite + Tailwind SPA in an app shell (`RootLayout` + sidebar/topbar), routed by `@tanstack/react-router` — `/` dashboard, `/vacancies`, `/applications`, `/log`, `/profile` ([ADR-0024](decisions/0024-web-shell-and-theme.md)). Talks to `apps/api` over HTTP. Keeps its **own** hand-written contract for the API shape — it never imports `core`. | `react`, `@tanstack/react-query`, `@tanstack/react-router`, `zod` |

Rationale for this split: [ADR-0001](decisions/0001-monorepo-npm-workspaces.md)
(monorepo), [ADR-0002](decisions/0002-core-shared-domain-layer.md) (core as the
shared domain layer), [ADR-0004](decisions/0004-one-service-two-transports.md) (two
transports over one service).

## Request lifecycles

**Analyzer saves a vacancy** (the write path):

```
Claude runs vacancy-match-analyzer
  → calls MCP tool save_vacancy (apps/mcp/src/vacancies/vacancies.tools.ts)
  → VacancyService.save()  (packages/core)
      → findUnique by applyUrl
          → exists?  return { created: false, vacancy }   (analysis discarded)
          → new?     normalizeRecommendation() → create → { created: true, vacancy }
  → tool returns { created, vacancy } as JSON text
```

**User works through the list** (the read/update path):

```
apps/web  useVacancies()  (TanStack Query)
  → GET  /api/v1/vacancies?limit=100        → VacancyService.list()
  → PATCH /api/v1/vacancies/:id/status     → VacancyService.updateStatus() → writeStatus()
        (optimistic cache update in the hook; rollback on error; invalidate on settle)
```

**User records an application** (Phase 2):

```
apps/web  ApplyDialog "mark as applied"  →  POST /api/v1/applications { vacancyId, ... }
apps/mcp  record_application { company, title, ... }
  → ApplicationService.record()   (packages/core, one transaction)
      → resolve the vacancy: link by id / link to a unique (company,title) match /
        create a placeholder Vacancy (fullText 'N/A', score 0 / derived; an ANALYZER
        comment only if one was passed)
      → already in the pipeline? AlreadyAppliedError
      → writeStatus(APPLIED), then writeStatus(status) if recorded further along
        (each a StatusChange row + the status / statusChangedAt cache)
      → set salary / tailored-CV flag; add the comment as a USER Comment
  → returns { application, resolution, vacancyCreated }   (the vacancy, as /applications reads it)
```

Both transports call the same core service methods; there is no business logic in
`apps/api` or `apps/mcp` beyond input validation and shaping the response. See
[`contracts.md`](contracts.md) for the exact surfaces.

`apps/web` keeps one shared HTTP helper — `src/lib/api.ts` (`API_BASE`,
`parseResponse`) — plus `src/lib/routeMeta.ts` (each route's title / subtitle /
`rail` metadata, read by `RootLayout`) and the presentational pieces both features
draw on under `src/components/ui/` (`ScorePill`, `KpiTile`, `Modal`, `Select`,
`ExpandableText`, `SoonPage`). The shell is `src/components/RootLayout.tsx` +
`src/components/shell/`.

## Dev stack (Docker Compose)

`docker-compose.yml` runs: `postgres`, a `core` build watcher (`tsc --watch`),
`api`, `mcp`, `web`.

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
- **`api`/`mcp` don't watch `core`'s `dist/`.** They consume the *compiled* output
  of `packages/core`, and their watchers don't react to it changing. After editing
  `packages/core`, run `docker compose restart api mcp` if the change doesn't show
  up. This is the friction tracked in
  [ADR-0003](decisions/0003-core-consumed-as-dist.md).
- **Healthchecks gate startup.** `postgres` has a `pg_isready` healthcheck; `api`
  and `mcp` `depends_on: postgres: condition: service_healthy`; `api` has its own
  `/health` healthcheck and `web` waits on `api` being healthy. See
  [ADR-0016](decisions/0016-docker-dev-stack-and-ci.md).

After changing dependencies or `schema.prisma`, a container's `node_modules` /
generated Prisma client go stale — **each service has its own anonymous
`node_modules` volume; they are not shared**. Run the fix inside *every* consuming
container, not just `core`:

- new dependency → `docker compose exec <svc> npm install` in each service that
  imports it (e.g. `web` for a new web dep).
- `schema.prisma` change → `docker compose exec <svc> npx prisma generate --schema
  packages/core/prisma/schema.prisma` in `core` **and** `api` **and** `mcp`, then
  `docker compose restart api mcp`. Symptom of a missed `api`/`mcp` regen: an
  `@IsEnum(<NewEnum>)` DTO crashes on boot because `core`'s re-export of the enum
  resolves to `undefined`.
- or just `docker compose up -d --build`.

## System invariants

The load-bearing assumptions. Each links to the section or ADR that owns it.

1. **`packages/core` is the only database client.** `apps/api` and `apps/mcp`
   reach the DB *only* through `VacancyService` / `ApplicationService`. A
   query written in a controller or a tool handler is a bug.
   → [ADR-0002](decisions/0002-core-shared-domain-layer.md)
2. **A vacancy is analysed once.** `save()` never overwrites an existing row for a
   given `applyUrl`. Anything that expects re-analysis to update stored fields is
   wrong. → [ADR-0005](decisions/0005-analyze-once.md),
   [`domain-model.md`](domain-model.md)
3. **`recommendation` is the analyzer's; `status` is the user's.** They are
   independent axes and neither is derived from the other, and they have disjoint
   writers: `save()` and `record()`'s create-vacancy path write the analysis fields
   (and a new vacancy's first `NOT_REVIEWED`); `writeStatus()` alone writes `status`
   + `statusChangedAt` and the `StatusChange` journal, in one transaction.
   → [`domain-model.md`](domain-model.md),
   [ADR-0029](decisions/0029-one-vacancy-table.md)
4. **`recommendation` is stored canonical-English.** Ukrainian input is normalized
   on the way in (`normalizeRecommendation`). Every filter/enum downstream assumes
   English. → [`domain-model.md`](domain-model.md)
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

## Stack

Node 24 · PostgreSQL 17 · Prisma 7 · NestJS 12 · React 19 · Vite · Vitest 5 ·
Biome 2 · `@modelcontextprotocol/sdk` 1 · `@tanstack/react-query` 5 ·
`@tanstack/react-router` 1 · zod 4.
