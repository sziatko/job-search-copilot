# Architecture Decision Records

One file per load-bearing decision. Small deliberate choices (a status code, an
index type, a lint-rule tweak) are documented as sections in
[`../architecture.md`](../architecture.md), [`../domain-model.md`](../domain-model.md),
or [`../contracts.md`](../contracts.md) instead — not as their own ADR.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-monorepo-npm-workspaces.md) | Monorepo, npm workspaces | Accepted |
| [0002](0002-core-shared-domain-layer.md) | `packages/core` as a framework-agnostic shared domain layer | Accepted |
| [0003](0003-core-consumed-as-dist.md) | Apps consume `core` as compiled `dist/` | Accepted (known friction) |
| [0004](0004-one-service-two-transports.md) | One domain service, two transports (REST + MCP) | Accepted |
| [0005](0005-analyze-once.md) | Analyze-once: `save()` skip-if-exists, `{ created, vacancy }`, POST 201/200 | Accepted |
| [0006](0006-nest-di-prisma-lifecycle.md) | Nest DI end-to-end + `PrismaService` connection lifecycle | Accepted |
| [0007](0007-env-config-and-loading.md) | Validated fail-fast env config + `load-env.ts` loading | Accepted |
| [0008](0008-api-prefix-and-versioning.md) | `/api/v1` prefix, URI versioning, version-neutral `/health` | Accepted |
| [0009](0009-domain-errors-and-configure-app.md) | Domain errors → 422 filter; shared `configureApp()` | Accepted |
| [0010](0010-mcp-server-factory.md) | MCP `createServer()` factory for in-memory-transport tests | Accepted |
| [0011](0011-web-tanstack-query.md) | Web data layer: TanStack Query + optimistic mutation | Accepted |
| [0012](0012-web-hand-written-contract.md) | Web keeps a hand-written zod API contract (no `core` import) | Accepted |
| [0013](0013-accessible-ui-primitives.md) | Accessible UI primitives: `Modal`, `ExpandableText` | Accepted |
| [0014](0014-biome-and-nest-di-import-type.md) | Biome + the `apps/api` `useImportType` override | Accepted |
| [0015](0015-testing-strategy.md) | Integration tests, not mocked Prisma; real test DB | Accepted |
| [0016](0016-docker-dev-stack-and-ci.md) | Docker Compose dev stack + CI pipeline | Accepted |

## Template

```markdown
# NNNN — Title

- Status: Accepted | Accepted (known friction) | Superseded by NNNN
- Phase: N   ·   Date: YYYY-MM

## Context
The problem and the constraints that forced a choice.

## Decision
What was chosen, in one paragraph.

## Why this and not the alternatives
The options that were on the table and why each lost.

## Consequences
What the decision buys; what it costs.

## What this constrains — breaks if you change it
Concrete `touch X → Y breaks` statements. Name real files and behaviours.

## Related
Other ADRs, the code paths involved, any deferred open questions.
```
