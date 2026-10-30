# 0002 — `packages/core` as a framework-agnostic shared domain layer

- Status: Accepted · Date: 2026-09

## Context
The REST API and the MCP server need the same operations on vacancies: the schema,
the queries, the status rules, the domain errors. Two copies would drift.

## Decision
All of it lives in `packages/core`, with no `@nestjs/*`, no MCP SDK, no HTTP. Its one
public surface is `src/index.ts`:

- the services (`VacancyService`, `ApplicationService`, `VacancyIntakeService`,
  `StatsService`) — plain classes, every query goes through them. Each takes an
  `Unscoped` client (default: a lazy process-wide one; scoped per call by `forUser`,
  [ADR-0038](0038-multi-user-shared-schema.md)), so Nest can inject its own and a test
  can pass one;
- `createPrismaClient(url)` / `getPrisma()`;
- the domain rules and errors (`parseRecommendation`, `PIPELINE_STATUSES`,
  `DomainError` and its subclasses);
- auth (`createAuth`, `verifyApiKey`);
- the Prisma types and enums the apps need, re-exported, so they do not depend on
  `@prisma/client` directly.

`apps/api` and `apps/mcp` are thin adapters: validate the input, call a service,
shape the response.

## Why this and not the alternatives
- **Logic in each app** — two query layers that diverge the first time one gets a fix.
- **A shared NestJS module** — drags `@nestjs/*` into the MCP server.

## Consequences
- One place answers "what can the app do to a vacancy".
- Importing `core` has no side effects and loads no env
  ([ADR-0007](0007-env-config-and-loading.md)), so it cannot throw.
- It is consumed as compiled `dist/` ([ADR-0003](0003-core-consumed-as-dist.md)).

## What this constrains — breaks if you change it
- A framework or transport dependency in `core` → the MCP server inherits it, and so
  does every future transport.
- A Prisma query in a controller or a tool handler → it bypasses the code tested
  against the real DB and the user scoping (invariants 1 and 11). The one exception is
  `/health`'s `SELECT 1`: it reads no user's data.
- A service method's signature → both transports and their specs.

## Related
[ADR-0004](0004-one-service-two-transports.md), [ADR-0006](0006-nest-di-prisma-lifecycle.md),
`packages/core/src/index.ts`.
