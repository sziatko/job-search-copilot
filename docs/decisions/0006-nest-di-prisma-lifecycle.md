# 0006 — Nest DI end-to-end + `PrismaService` connection lifecycle

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
The initial `apps/api` scaffold `new`'d a module-level `EstimatedVacancyService`
singleton and imported it directly into the controller, and `packages/core`
created a `PrismaClient` at import time. That bypassed Nest's DI container
entirely: no way to swap the service in tests (`overrideProvider`), no lifecycle
hooks, and connections were never drained on `SIGTERM`.

## Decision
Use Nest DI properly:

- `PrismaService` (`apps/api/src/prisma/prisma.service.ts`) — `@Injectable`,
  `implements OnModuleInit, OnModuleDestroy`. Builds its `PrismaClient` via
  `core`'s `createPrismaClient(config.get('DATABASE_URL'))`; `$connect()` on init,
  `$disconnect()` on destroy. Exposed as a `@Global` `PrismaModule`.
- `EstimatedVacancyService` stays a plain `core` class (framework-agnostic —
  [ADR-0002](0002-core-shared-domain-layer.md)) but is registered in
  `EstimatedVacanciesModule` via a `useFactory` provider that constructs it with
  `PrismaService`'s client.
- `main.ts` calls `app.enableShutdownHooks()` so Nest forwards `SIGTERM`/`SIGINT`
  to `onModuleDestroy`.
- `packages/core` no longer creates a client at import — `getPrisma()` is lazy
  ([ADR-0007](0007-env-config-and-loading.md)).

## Why this and not the alternatives
- **Keep the module-level singleton** — works, but throws away the framework's
  testability and lifecycle management that we're already paying for in
  complexity. The MCP server (no DI container) legitimately still `new`s the
  service; the API shouldn't.
- **`PrismaService extends PrismaClient`** — the common Nest recipe, but it would
  duplicate the driver-adapter wiring (`PrismaPg`) that already lives in
  `core`'s `createPrismaClient`. Composition (`PrismaService.client`) keeps that
  wiring in one place.
- **`@Injectable()` on the `core` class** — would couple `core` to `@nestjs/*`.

## Consequences
- Tests can `overrideProvider(EstimatedVacancyService)` or run against a real
  client; the e2e suite boots the real `AppModule`.
- `$disconnect()` runs on shutdown → the pool drains instead of dropping
  connections.
- The provider wiring is explicit (a `useFactory` in
  `estimated-vacancies.module.ts`) rather than decorator magic on a foreign class.

## What this constrains — breaks if you change it
- Reintroducing a module-level `new EstimatedVacancyService()` in `apps/api` →
  it stops using the lifecycle-managed client; two clients, two pools.
- Removing `enableShutdownHooks()` → `onModuleDestroy` never fires;
  `$disconnect()` is dead code again.
- Making `core`'s `getPrisma()` eager again → importing `core` (which `apps/api`
  does transitively everywhere) can throw before env is loaded.

## Related
[ADR-0002](0002-core-shared-domain-layer.md), [ADR-0007](0007-env-config-and-loading.md),
`apps/api/src/prisma/`, `apps/api/src/estimated-vacancies/estimated-vacancies.module.ts`.
