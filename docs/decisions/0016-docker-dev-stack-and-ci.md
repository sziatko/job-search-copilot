# 0016 — Docker Compose dev stack + CI pipeline

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
Local development needs Postgres plus the three apps and the `core` build, with
live reload, on a Windows/Docker Desktop host. CI needs to prove a change is
sound before merge.

## Decision — dev stack (`docker-compose.yml`)
- Services: `postgres` (`postgres:17-alpine`), `core` (`tsc --watch`), `api`
  (`nest start --watch`), `mcp` (`sleep infinity`), `web` (`vite`).
- **Anonymous `node_modules` volumes** per workspace over a `.:/repo` bind mount,
  so the host's `node_modules` don't leak in and vice-versa.
- **Polling watchers** — `CHOKIDAR_USEPOLLING=true` / `vite server.watch.usePolling`
  because bind-mount change events are unreliable on Windows/Docker Desktop.
- **`mcp` idles** on `sleep infinity`; a Claude session `docker exec`s in and runs
  its own `npm run dev:mcp` (fresh-container startup is too slow for the MCP
  connect timeout).
- **Healthchecks + ordering:** `postgres` has `pg_isready`; `api` and `mcp`
  `depends_on: postgres: condition: service_healthy`; `api` has a `/health`
  healthcheck (`wget http://localhost:3000/health`); `web` waits on `api` being
  healthy.
- **Multi-stage Dockerfiles** (`dev` / `build` / `production`): `dev` installs
  deps only (source comes from the bind mount); `production` is prod deps +
  compiled output (`web`'s production stage is just nginx serving static files).
- Header comment states the stack is **local dev only** — `postgres/postgres`
  defaults are not for a deployed environment.

## Decision — CI (`.github/workflows/ci.yml`)
On push to `main` and every PR: `ubuntu-latest`, Node 24, a `postgres:17-alpine`
service (`job_search_copilot_test`), `DATABASE_URL` in the job env, then
`npm ci` → `npm run generate` → `prisma migrate deploy` (test DB) →
`npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.

## Why this and not the alternatives
- **No polling** — the default file-watch events; they drop silently on Windows
  bind mounts, so edits don't rebuild.
- **`mcp` as a normal long-running service** — one session at a time, and
  cold-start latency exceeds the MCP client's connect timeout.
- **`docker build` in CI** — would catch Dockerfile regressions, but adds
  minutes per run for little payoff at the scaffold stage. **Deferred** (see
  [`backlog.md`](../backlog.md)).
- **Deploy from CI** — nothing is deployed yet; out of scope.

## Consequences
- One `docker compose up -d` gives a working stack; `web` only comes up once
  `api` is healthy.
- CI is the gate: lint + types + the full integration suite + a build must pass.
- After a dependency or `schema.prisma` change, container `node_modules` /
  generated client are stale — re-`npm install` / `npm run generate` in the
  container, or `up -d --build`.

## What this constrains — breaks if you change it
- Removing the polling env vars → Windows-host edits stop triggering
  rebuilds/HMR.
- Giving `mcp` a real `command` → single-session MCP; the `docker exec` startup
  flow no longer applies.
- Changing `/health`'s path or the `/api` prefix rules → the `api` healthcheck
  `wget` fails; the container reports unhealthy and `web` never starts
  ([ADR-0008](0008-api-prefix-and-versioning.md)).
- Removing the CI `prisma migrate deploy` step → the integration suite runs
  against an unmigrated test DB and fails on the first query.
- Changing a root script name (`lint` / `typecheck` / `test` / `build`) → the CI
  steps call them by name.

## Related
[ADR-0003](0003-core-consumed-as-dist.md), [ADR-0015](0015-testing-strategy.md),
`docker-compose.yml`, `apps/*/Dockerfile`, `.github/workflows/ci.yml`.
