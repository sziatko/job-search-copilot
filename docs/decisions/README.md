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
| [0017](0017-application-1to1-delta.md) | `Application` is a minimal 1:1 delta on `EstimatedVacancy` | Accepted |
| [0018](0018-application-status-separate-enum.md) | `ApplicationStatus` is a separate enum from `UserAction` | Accepted |
| [0019](0019-record-or-create-vacancy.md) | Recording an application find-or-creates the `EstimatedVacancy` | Accepted |
| [0020](0020-web-router-tanstack.md) | Web router: `@tanstack/react-router`; TanStack Form deferred | Accepted |
| [0021](0021-tracker-import-script.md) | One-off `tracker.md` importer: dry-run default, typed `--commit` gate | Accepted |
| [0022](0022-timeout-derived-until-scheduled.md) | Timeout is derived on the client until a scheduled job owns it | Accepted |
| [0023](0023-canonical-applyurl.md) | `applyUrl` is stored canonicalized, with the query string dropped except where a site rule defines it | Accepted |
| [0024](0024-web-shell-and-theme.md) | The web app shell: a three-state theme, a dashboard at `/`, two placeholder routes | Accepted |
| [0025](0025-vacancies-list-search-server-side.md) | The vacancies list: server-side search, a derived company count, and what stays out of the list item | Accepted |
| [0026](0026-vacancy-log-table.md) | The vacancy log is its own table, and answers only "new or duplicate" | Accepted |
| [0027](0027-linkedin-site-rule.md) | LinkedIn site rule: one key per job id, locale host merged | Accepted |
| [0028](0028-comment-table.md) | Application comments are rows in a `Comment` table, replacing `statusComment` | Accepted |
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
