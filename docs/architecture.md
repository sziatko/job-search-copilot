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
packages/core   ── domain layer: Prisma schema/client, EstimatedVacancyService,
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
| [`packages/core`](../packages/core/README.md) | The only place that talks to the database. Owns the `EstimatedVacancy` schema + migrations, the `EstimatedVacancyService` (all queries), recommendation normalization, and the `DomainError` hierarchy. | `@prisma/client`, `pg` |
| `apps/api` | Thin HTTP transport over `EstimatedVacancyService` for the web app. NestJS: DI, DTO validation, versioned routes, a health check. | `core`, `@nestjs/*`, `class-validator`, `zod` |
| `apps/mcp` | Thin stdio transport over the *same* service, exposing four tools so Claude (running the analyzer) can save and query vacancies directly. | `core`, `@modelcontextprotocol/sdk`, `zod` |
| `apps/web` | React 19 + Vite + Tailwind dashboard. Talks to `apps/api` over HTTP. Keeps its **own** hand-written contract for the API shape — it never imports `core`. | `react`, `@tanstack/react-query`, `zod` |

Rationale for this split: [ADR-0001](decisions/0001-monorepo-npm-workspaces.md)
(monorepo), [ADR-0002](decisions/0002-core-shared-domain-layer.md) (core as the
shared domain layer), [ADR-0004](decisions/0004-one-service-two-transports.md) (two
transports over one service).

## Request lifecycles

**Analyzer saves a vacancy** (the write path):

```
Claude runs vacancy-match-analyzer
  → calls MCP tool save_estimated_vacancy (apps/mcp/src/server.ts)
  → EstimatedVacancyService.save()  (packages/core)
      → findUnique by applyUrl
          → exists?  return { created: false, vacancy }   (analysis discarded)
          → new?     normalizeRecommendation() → create → { created: true, vacancy }
  → tool returns { created, vacancy } as JSON text
```

**User works through the list** (the read/update path):

```
apps/web  useVacancies()  (TanStack Query)
  → GET  /api/v1/estimated-vacancies?limit=100        → EstimatedVacancyService.list()
  → PATCH /api/v1/estimated-vacancies/:id/user-action → EstimatedVacancyService.updateUserAction()
        (optimistic cache update in the hook; rollback on error; invalidate on settle)
```

Both transports call the same `EstimatedVacancyService` methods; there is no
business logic in `apps/api` or `apps/mcp` beyond input validation and shaping the
response. See [`contracts.md`](contracts.md) for the exact surfaces.

## Dev stack (Docker Compose)

`docker-compose.yml` runs: `postgres`, a `core` build watcher (`tsc --watch`),
`api`, `mcp`, `web`.

- **File watchers poll.** Bind-mount change events don't reliably reach containers
  on Windows/Docker Desktop, so `tsc --watch`, `nest start --watch`, `tsx watch`,
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
generated Prisma client go stale (they're anonymous volumes): re-run
`docker compose exec <svc> npm install` / `npm run generate`, or
`docker compose up -d --build`.

## System invariants

The load-bearing assumptions. Each links to the section or ADR that owns it.

1. **`packages/core` is the only database client.** `apps/api` and `apps/mcp`
   reach the DB *only* through `EstimatedVacancyService`. A query written in a
   controller or a tool handler is a bug.
   → [ADR-0002](decisions/0002-core-shared-domain-layer.md)
2. **A vacancy is analysed once.** `save()` never overwrites an existing row for a
   given `applyUrl`. Anything that expects re-analysis to update stored fields is
   wrong. → [ADR-0005](decisions/0005-analyze-once.md),
   [`domain-model.md`](domain-model.md)
3. **`recommendation` is the analyzer's; `userAction` is the user's.** They are
   independent axes and neither is derived from the other. `save()` must never
   touch `userAction`; `updateUserAction()` must never touch analysis fields.
   → [`domain-model.md`](domain-model.md)
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
Biome 2 · `@modelcontextprotocol/sdk` 1 · `@tanstack/react-query` 5 · zod 4.
