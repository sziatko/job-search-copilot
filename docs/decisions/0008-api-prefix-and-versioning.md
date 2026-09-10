# 0008 — API surface: `/api/v1` prefix, URI versioning, version-neutral `/health`

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
The initial API mounted routes at the root (`/estimated-vacancies`). Before any
deployment it needs a namespace (so it can share a host with other things) and a
versioning story (so a breaking change doesn't break the web app mid-deploy).

## Decision
In `apps/api/src/setup-app.ts`:

- `app.setGlobalPrefix('api', { exclude: ['health'] })` — everything under `/api`
  except the health check.
- `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })` —
  routes become `/api/v1/...`. A future breaking shape gets a `v2` controller
  rather than mutating `v1`.
- `HealthController` is `@Controller({ path: 'health', version: VERSION_NEUTRAL })`
  — stays at exactly `/health`, no prefix, no version, so infra (the
  `docker-compose.yml` healthcheck, load balancers) has a stable probe.

## Why this and not the alternatives
- **No prefix / no versioning** — fine for a toy, but the first breaking change
  forces a coordinated web+api deploy with a downtime window.
- **Header or media-type versioning** — more "correct" to some, but harder to hit
  with `curl` / a browser and needs client cooperation. URI versioning is
  obvious and greppable.
- **`/health` under `/api/v1`** — an infra probe shouldn't depend on the API
  version; and the `docker-compose` healthcheck would have to know the version.

## Consequences
- All client URLs carry `/api/v1`. `apps/web`'s `API_BASE` bakes it in; the MSW
  handlers and e2e tests use the full path.
- Adding `v2`: a new controller with `@Controller({ version: '2' })`, `v1` stays.
- `configureApp()` is where prefix + versioning + pipes + filters + CORS +
  shutdown hooks are wired, shared by `main.ts` and the e2e boot
  ([ADR-0009](0009-domain-errors-and-configure-app.md)).

## What this constrains — breaks if you change it
- Changing the prefix or default version → `apps/web/src/features/vacancies/api.ts`
  (`API_BASE`), `apps/web/src/test/msw/handlers.ts`, and every URL in
  `apps/api/test/estimated-vacancies.e2e.spec.ts`.
- Removing `VERSION_NEUTRAL` from `HealthController` (or the `exclude: ['health']`)
  → `/health` moves to `/api/v1/health`; the `docker-compose.yml` `api`
  healthcheck (`wget .../health`) fails and the container reports unhealthy.
- Dropping `configureApp()` and wiring things inline in `main.ts` → the e2e suite
  no longer exercises the same pipes/filters/routing as production; they drift.

## Related
[ADR-0009](0009-domain-errors-and-configure-app.md), [`../contracts.md`](../contracts.md),
`apps/api/src/setup-app.ts`, `apps/api/src/health/`.
