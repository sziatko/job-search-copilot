# 0002 — `packages/core` as a framework-agnostic shared domain layer

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
The REST API and the MCP server need the same operations: save an analysed
vacancy, fetch one, list/filter, update the user's action. Those operations
involve the DB schema, Prisma queries, recommendation normalization, and a small
set of domain errors. Duplicating that across two transports would drift.

## Decision
All of it lives in `packages/core`, which is **framework-agnostic** — no
`@nestjs/*`, no MCP SDK, no HTTP. Its public surface (`src/index.ts`):

- `EstimatedVacancyService` — a plain class; every DB query goes through it.
  Constructor takes a `PrismaClient` (defaulting to a lazy process-wide one) so
  Nest can inject its lifecycle-managed client and tests can pass their own.
- `createPrismaClient(url)` / `getPrisma()` — client construction + a lazy
  singleton for DI-less callers.
- `normalizeRecommendation` + `RECOMMENDATION_INPUT_VALUES` — the EN/UA mapping.
- `DomainError` / `InvalidRecommendationError` — the caller-mistake error type.
- Re-exported Prisma types/enums (`EstimatedVacancy`, `Recommendation`,
  `UserAction`, `PrismaClient`) so consumers don't depend on `@prisma/client`
  directly.

`apps/api` and `apps/mcp` are then thin adapters: validate input, call a service
method, shape the response.

## Why this and not the alternatives
- **Logic in each app** — two copies of the query layer, the normalization, and
  the error handling; they would diverge the first time one transport got a fix.
- **A "core" NestJS module reused by both** — would drag `@nestjs/*` into the MCP
  server (and a browser-incompatible dependency tree into anything that touched
  it). Keeping `core` framework-free means the MCP server stays tiny and the web
  app *could* (though doesn't — [ADR-0012](0012-web-hand-written-contract.md))
  import types from it.
- **An ORM-model-per-transport** — same duplication problem, plus schema drift.

## Consequences
- One place to reason about "what the app can do to a vacancy". Both transports
  are provably thin (see [`../architecture.md`](../architecture.md) lifecycles).
- `core` has import-time purity: no side effects, no env loading
  ([ADR-0007](0007-env-config-and-loading.md)), so importing it can't throw.
- Consumed as compiled `dist/` → [ADR-0003](0003-core-consumed-as-dist.md).

## What this constrains — breaks if you change it
- Adding `@nestjs/*` or any HTTP/transport dependency to `packages/core` → the MCP
  server's dependency tree balloons; the "framework-agnostic" invariant is gone
  and future transports inherit the coupling.
- Writing a Prisma query in `apps/api` (a controller) or `apps/mcp` (a tool
  handler) → bypasses the one place that's tested against the real DB; the
  "core is the only DB client" invariant breaks.
- Changing an `EstimatedVacancyService` method signature → both transports and the
  `packages/core` + `apps/mcp` specs.

## Related
[ADR-0001](0001-monorepo-npm-workspaces.md), [ADR-0004](0004-one-service-two-transports.md),
[ADR-0006](0006-nest-di-prisma-lifecycle.md),
`packages/core/src/estimated-vacancy.service.ts`, `packages/core/src/index.ts`.
