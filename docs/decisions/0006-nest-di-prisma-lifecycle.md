# 0006 — Nest DI end-to-end + `PrismaService` connection lifecycle

- Status: Accepted · Date: 2026-09

## Context
`core`'s services are plain classes ([ADR-0002](0002-core-shared-domain-layer.md)).
`apps/api` still wants Nest's DI: providers a test can override, and connections
drained on `SIGTERM`.

## Decision
- `PrismaService` (`apps/api/src/prisma/prisma.service.ts`) — `@Injectable`,
  `OnModuleInit` / `OnModuleDestroy`. It builds its client with `core`'s
  `createPrismaClient(config.get('DATABASE_URL'))`, connects on init, disconnects on
  destroy. A `@Global` `PrismaModule`.
- The `core` services are registered with `useFactory` providers (e.g.
  `vacancies.module.ts`) that construct them on `PrismaService`'s client.
- `configureApp` (`setup-app.ts`) calls `app.enableShutdownHooks()`, so `SIGTERM` /
  `SIGINT` reach `onModuleDestroy`.
- `core`'s `getPrisma()` is lazy: importing `core` creates no client.

The MCP server has no DI container: it `new`s the services on `getPrisma()`.

## Why this and not the alternatives
- **A module-level singleton in the API** — throws away overridable providers and
  lifecycle hooks.
- **`PrismaService extends PrismaClient`** — the common recipe, but it would duplicate
  the driver-adapter wiring (`PrismaPg`) that lives in `createPrismaClient`.
- **`@Injectable()` on the `core` classes** — couples `core` to `@nestjs/*`.

## Consequences
- The e2e suite boots the real `AppModule`; a test can override a provider.
- The pool drains on shutdown.
- The wiring is explicit (`useFactory`), not decorators on a foreign class.

## What this constrains — breaks if you change it
- A module-level `new VacancyService()` in `apps/api` → a second client and pool,
  outside the lifecycle.
- Removing `enableShutdownHooks()` → `onModuleDestroy` never runs.
- An eager `getPrisma()` → importing `core` can throw before env is loaded.

## Related
[ADR-0007](0007-env-config-and-loading.md), `apps/api/src/prisma/`.
