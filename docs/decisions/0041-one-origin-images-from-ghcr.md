# 0041 — One origin through Caddy, images from GHCR, the migration as a service

- Status: Accepted · Date: 2026-10

## Context
JSC goes onto a VPS shared with other projects, which already runs Caddy (HTTPS per
subdomain) and one Postgres. The web, the API and the MCP server must be reachable
over HTTPS; the session cookie must reach the API from the web; a new version must not
start against an older schema; and the server should not build anything.

## Decision
- **One origin for the web and the API.** `jsc.<domain>` serves the web at `/` and the
  API at `/api/*` and `/.well-known/*`; Caddy routes by path. The production web image
  is built with an empty `VITE_API_URL`, so the bundle calls a relative `/api/v1`.
  `WEB_ORIGIN` and `BETTER_AUTH_URL` are the same URL. The MCP server has a subdomain
  of its own (`jsc-mcp.<domain>`): its clients call it directly.
- **Images from GHCR.** CI (`images.yml`) builds each Dockerfile's `production` stage
  and publishes it as `sha-<commit>`; the server runs the tag `JSC_TAG` names in its
  `.env`. The packages are public, as the repo is.
- **The migration is a one-shot service** (`jsc-migrate` in `compose.prod.yml`): the api
  image running `prisma migrate deploy`. The api starts only after it exits with 0.
- **Swagger is off in production** (`NODE_ENV=production`, the image's): `/api/docs`
  sits outside the auth guard.

## Why this and not the alternatives
- **Two origins (`jsc.` and `api.jsc.`)** — a cross-origin session cookie, CORS on
  every request, and the API's URL baked into the web image at build time.
- **Building on the server** — minutes of CPU on a shared box, and what runs is not
  what CI built and tested.
- **Migrating at the api's start** — every replica would race to migrate, and a failed
  migration becomes a crash loop instead of one failed run with its log.
- **A private registry** — the server would need a login, and the images hold nothing
  secret.

## Consequences
- The web and the API deploy together: a tag is one commit of both.
- Rolling back past a migration means restoring a backup; there are no down migrations
  ([`deployment.md`](../deployment.md#roll-back)).
- Locally nothing changes: dev runs on two origins (`localhost:5173`, `:3000`) with CORS.

## What this constrains — breaks if you change it
- An absolute `VITE_API_URL` in the production build → the web calls that origin, and
  the cookie and CORS rules of two origins apply again.
- A Caddy route for the API without `/.well-known/*` → MCP clients cannot find the
  authorization server's metadata ([ADR-0035](0035-mcp-over-http-oauth-resource-server.md)).
- `jsc-migrate`'s `service_completed_successfully` dependency removed → the api can
  start on an unmigrated database.
- A service name without the `jsc-` prefix → it clashes on the shared `web` network
  with another project's service of that name.

## Related
[ADR-0016](0016-docker-dev-stack-and-ci.md), [ADR-0034](0034-auth-better-auth-in-core.md),
[`deployment.md`](../deployment.md), `compose.prod.yml`, `apps/web/Dockerfile`.
