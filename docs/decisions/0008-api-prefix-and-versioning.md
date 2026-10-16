# 0008 — API surface: `/api/v1` prefix, URI versioning, version-neutral `/health`

- Status: Accepted · Date: 2026-09

## Context
The API needs a namespace, to share a host with other things, and a way to change a
shape without breaking the web app mid-deploy.

## Decision
In `apps/api/src/setup-app.ts`:

- `app.setGlobalPrefix('api', { exclude: ['health'] })` — everything under `/api`
  but the health check;
- `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })` — routes
  are `/api/v1/...`; a breaking shape gets a `v2` controller, `v1` stays;
- `HealthController` is `VERSION_NEUTRAL`: exactly `/health`, a stable probe for the
  Compose healthcheck and any load balancer.

## Why this and not the alternatives
- **No prefix, no version** — the first breaking change forces a coordinated
  web + API deploy.
- **Header or media-type versioning** — harder to hit with `curl` or a browser, and
  needs the client's cooperation. A URI version is obvious and greppable.
- **`/health` under `/api/v1`** — an infra probe should not depend on the API version.

## Consequences
- Every client URL carries `/api/v1`; the web's `API_BASE` bakes it in.
- `configureApp()` wires the prefix, versioning, pipes, filters, CORS and shutdown
  hooks for both the entrypoint and the e2e suite
  ([ADR-0009](0009-domain-errors-and-configure-app.md)).

## What this constrains — breaks if you change it
- The prefix or the default version → `apps/web/src/lib/api.ts` (`API_BASE`), the MSW
  handlers, every URL in `apps/api/test/*.e2e.spec.ts`.
- `/health` under the prefix → the Compose `api` healthcheck fails; the container
  reports unhealthy and `web` never starts.

## Related
[`../contracts.md`](../contracts.md), `apps/api/src/health/`.
