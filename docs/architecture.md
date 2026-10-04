# Architecture

## What the system is

A personal job-search tool. Vacancies are analysed **elsewhere** — by the
`vacancy-match-analyzer` prompt, which is not part of this repo — producing a match
score, a recommendation, and reasoning. This repo is the plumbing around that
output: somewhere to store each analysed vacancy, and a UI to work through them
from *not reviewed* to *applied* or *declined*.

Single user (the user), signed in with Google / LinkedIn / a passkey (phase 6); no
multi-tenancy. Local-first: Docker Compose on a laptop, Postgres in a container.

## The four packages

```
packages/core   ── domain layer: Prisma schema/client, VacancyService,
                   recommendation normalization, DomainError types.
                   Framework-agnostic — no @nestjs/*, no MCP SDK.
      ▲     ▲
      │     └───────────────┐
apps/api (NestJS REST)      apps/mcp (MCP server, stdio + HTTP)
      ▲                            ▲
      │ HTTP /api/v1               │ stdio (per Claude Desktop session), or
      │                            │ Streamable HTTP /mcp + an OAuth token from api
apps/web (React SPA)        vacancy-match-analyzer
```

| Package | Responsibility | Depends on |
| --- | --- | --- |
| [`packages/core`](../packages/core/README.md) | The only place that talks to the database. Owns the schema (`Vacancy` with its `StatusChange` journal and `Comment`s) + migrations, the `VacancyService`, `ApplicationService`, `VacancyIntakeService` and `StatsService` (all queries), `writeStatus` (the only writer of status), the timeout rule (`TIMEOUT_DAYS`, `timedOutWhere` in `status.ts`), recommendation normalization, and the `DomainError` hierarchy. | `@prisma/client`, `pg` |
| `apps/api` | Thin HTTP transport over the core services for the web app. NestJS: DI, DTO validation, versioned routes (`vacancies`, `applications`), a health check. | `core`, `@nestjs/*`, `class-validator`, `zod` |
| `apps/mcp` | Thin transport over the *same* services, exposing thirteen tools (7 for vacancies, 4 for applications incl. `update_vacancy_status`, 2 for the vacancy log — see [ADR-0010](decisions/0010-mcp-server-factory.md)) so Claude can save/query analysed vacancies and record/query applications directly. Two entrypoints over one `createServer()`: `src/index.ts` (stdio, no auth) and `src/http.ts` (Streamable HTTP, an OAuth 2.1 resource server checking the API's JWTs — [ADR-0035](decisions/0035-mcp-over-http-oauth-resource-server.md)). | `core`, `@modelcontextprotocol/sdk`, `express`, `jose`, `zod` |
| `apps/web` | React 19 + Vite + Tailwind SPA in an app shell (`RootLayout` + sidebar/topbar), routed by `@tanstack/react-router` — `/` dashboard, `/vacancies`, `/applications`, `/inbox`, `/profile` ([ADR-0024](decisions/0024-web-shell-and-theme.md)). Talks to `apps/api` over HTTP. Keeps its **own** hand-written contract for the API shape — it never imports `core`. | `react`, `@tanstack/react-query`, `@tanstack/react-router`, `zod` |

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
          → analysed?    return { created: false, attached: false, vacancy }   (analysis discarded)
          → unanalysed?  writeAnalysis() → { created: false, attached: true, vacancy }
          → new?         create (NEW) → writeAnalysis() → { created: true, attached: false, vacancy }
  → tool returns { success: created || attached, vacancy: { id, company, title } } as JSON text

The analysis queue (phase 5): list_vacancies({ status: ['NEW'], hasText: true })
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
`parseResponse`, `cursorPageSchema`), `src/lib/useInfiniteList.ts` (a cursor-paged
table's query, [ADR-0030](decisions/0030-cursor-paging.md)) — plus `src/lib/routeMeta.ts` (each route's title / subtitle /
`rail` metadata, read by `RootLayout`) and the presentational pieces both features
draw on under `src/components/ui/` (`ScorePill`, `KpiTile`, `Modal`, `Select`,
`ExpandableText`, `SoonPage`). The shell is `src/components/RootLayout.tsx` +
`src/components/shell/`.

## Dev stack (Docker Compose)

`docker-compose.yml` runs: `postgres`, a `core` build watcher (`tsc --watch`),
`api`, `mcp`, `mcp-http`, `web`.

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
- **`api`/`mcp` don't watch `core`'s `dist/`.** They consume the *compiled* output
  of `packages/core`, and their watchers don't react to it changing. After editing
  `packages/core`, run `docker compose restart api mcp mcp-http` if the change doesn't
  show up (`mcp-http` runs `tsx` without a watcher: its own source edits want a
  restart too). This is the friction tracked in
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
- `schema.prisma` change → `docker compose restart api mcp mcp-http core`. Each of them
  runs `prisma generate` into its own volume before it starts (its `command` in
  `docker-compose.yml`). By hand: `docker compose exec <svc> npm --prefix /repo run
  generate`. Symptoms of a missed
  regen: an `@IsEnum(<NewEnum>)` DTO crashes on boot (`core`'s re-export resolves to
  `undefined`); a new enum *value* fails quieter — 400 from `@IsEnum`, 500 from a
  query that names it (phase 4.2, `UNAVAILABLE`).
- or just `docker compose up -d --build`.

## System invariants

The load-bearing assumptions. Each links to the section or ADR that owns it.

1. **`packages/core` is the only database client.** `apps/api` and `apps/mcp`
   reach the DB *only* through `VacancyService` / `ApplicationService`. A
   query written in a controller or a tool handler is a bug. Auth is the one other
   door: the Better Auth instance built by `createAuth` in `core` on `core`'s client
   (phase 6, once step 1 lands); the apps mount it, never build their own.
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
9. **Every REST route is closed by default** (phase 6, from step 2). A global guard
   wants a session; anonymous access is explicit (`@AllowAnonymous()`, `/health` only),
   machine access is explicit (`MachineTokenGuard`, the three n8n routes only).
   `Vacancy` has no owner, so an anonymous route exposes all the data.
   → [ADR-0034](decisions/0034-auth-better-auth-in-core.md),
   [ADR-0036](decisions/0036-machine-token-for-n8n.md)

## Stack

Node 24 · PostgreSQL 17 · Prisma 7 · NestJS 12 · React 19 · Vite · Vitest 5 ·
Biome 2 · `@modelcontextprotocol/sdk` 1 · `@tanstack/react-query` 5 ·
`@tanstack/react-router` 1 · zod 4.
