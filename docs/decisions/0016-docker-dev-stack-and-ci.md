# 0016 — Docker Compose dev stack + CI pipeline

- Status: Accepted · Date: 2026-09

## Context
Local development needs Postgres, the apps and the `core` build, with live reload, on
a Windows / Docker Desktop host. CI must prove a change sound before it merges.

## Decision — the dev stack (`docker-compose.yml`)
- Services: `postgres` (`postgres:17-alpine`), `core` (`tsc --watch`), `api`
  (`nest start --watch`), `mcp` (idles), `mcp-http` (MCP over HTTP), `web` (`vite`).
- A `.:/repo` bind mount, with an **anonymous `node_modules` volume per service**, so
  the host's `node_modules` stay out and each service has its own.
- `core`, `api`, `mcp` and `mcp-http` run `prisma generate` into their own volume on
  start.
- **Polling watchers** (`CHOKIDAR_USEPOLLING`, Vite's `server.watch.usePolling`):
  bind-mount change events are unreliable on Docker Desktop for Windows.
- **`mcp` idles** on `sleep infinity`; a Claude session `docker exec`s in and runs its
  own `npm run dev:mcp`. A fresh container takes 15–20 s to start, too close to the
  MCP client's connect timeout.
- **Healthchecks gate startup:** `api` and `mcp` wait for `postgres`'s `pg_isready`;
  `web` waits for `api`'s `/health`.
- **Multi-stage Dockerfiles** (`dev` / `build` / `production`): `dev` installs
  dependencies only (the source comes from the mount); `production` is prod
  dependencies and the compiled output (the web's is nginx serving static files).
- Local dev only: the `postgres/postgres` defaults are not for a deployed environment.

## Decision — CI (`.github/workflows/ci.yml`)
On a push to `main` and every PR: Ubuntu, Node 24, a Postgres service, then `npm ci`
→ `prisma generate` → `prisma migrate deploy` → `lint` → `typecheck` → `test` →
`build`. On a PR a second job runs the Playwright suite
([ADR-0037](0037-e2e-playwright.md)).

## Why this and not the alternatives
- **No polling** — edits on a Windows bind mount silently stop rebuilding.
- **`mcp` as a long-running server** — one session at a time, and a cold start past
  the connect timeout.
- **`docker build` in CI** — would catch Dockerfile regressions; minutes per run.
  A backlog row.

## Consequences
- One `docker compose up -d` gives a working stack.
- After a `core` change, a schema change or a new dependency, the containers need a
  restart or a rebuild: [`architecture.md` § Dev stack](../architecture.md#dev-stack-docker-compose).

## What this constrains — breaks if you change it
- The polling env vars removed → Windows-host edits stop triggering rebuilds and HMR.
- A real `command` for `mcp` → one MCP session at a time; `docker exec` no longer
  applies.
- `/health`'s path or the prefix rules → the `api` healthcheck fails, and `web` never
  starts ([ADR-0008](0008-api-prefix-and-versioning.md)).
- The CI `migrate deploy` step removed → the suite runs on an unmigrated DB.
- A root script renamed (`lint`, `typecheck`, `test`, `build`) → the CI steps call
  them by name.

## Related
[ADR-0003](0003-core-consumed-as-dist.md), [ADR-0015](0015-testing-strategy.md),
`apps/*/Dockerfile`.
