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
| [0005](0005-analyze-once.md) | Analyze-once: `save()` skip-if-exists, `{ created, vacancy }`, POST 201/200 | Accepted (amended by 0033) |
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
| 0017 | *Deleted in phase 3.1:* `Application` as a minimal 1:1 delta on the vacancy — replaced by 0029 | — |
| 0018 | *Deleted in phase 3.1:* `ApplicationStatus` as a separate enum from `UserAction` — replaced by 0029 | — |
| [0019](0019-record-or-create-vacancy.md) | Recording an application find-or-creates the `Vacancy` | Accepted |
| [0020](0020-web-router-tanstack.md) | Web router: `@tanstack/react-router`; TanStack Form deferred | Accepted |
| 0021 | *Deleted in phase 3.1:* the one-off `tracker.md` importer, run and removed | — |
| [0022](0022-timeout-derived-until-scheduled.md) | Timeout is derived on the client until a scheduled job owns it | Accepted |
| [0023](0023-canonical-applyurl.md) | `applyUrl` is stored canonicalized, with the query string dropped except where a site rule defines it | Accepted |
| [0024](0024-web-shell-and-theme.md) | The web app shell: a three-state theme, a dashboard at `/`, two placeholder routes | Accepted |
| [0025](0025-vacancies-list-search-server-side.md) | The vacancies list: server-side search, a derived company count, and what stays out of the list item | Accepted |
| 0026 | *Deleted in phase 5:* the vacancy log as its own table — replaced by 0033 | — |
| [0027](0027-linkedin-site-rule.md) | LinkedIn site rule: one key per job id, locale host merged | Accepted |
| 0028 | *Deleted in phase 3.1:* application comments as a `Comment` table on `Application` — replaced by 0029 | — |
| [0029](0029-one-vacancy-table.md) | One `Vacancy` table: one status, a `StatusChange` journal, comments with a `source` | Accepted (replaces 0017, 0018, 0028) |
| [0030](0030-cursor-paging.md) | The web's tables page by a Prisma cursor; MCP keeps offset | Accepted |
| [0031](0031-stats-endpoint.md) | One stats endpoint; the funnel counts the journal, and timeout moves to core | Accepted |
| [0032](0032-same-company-normalised-name.md) | Same company = an equal normalised name | Accepted (amends 0025) |
| [0033](0033-unscored-vacancies-in-one-table.md) | Unscored vacancies live in `Vacancy`: the log merges in, `NEW` and `FILTERED_OUT` | Accepted (replaces 0026, amends 0005) |

A gap in the numbers is a deleted ADR. The ADR that replaced it names it on its
`Replaces:` line (an ADR whose code is simply gone has none), and
`git log --all -- 'docs/decisions/NNNN-*'` shows it.

## Template

```markdown
# NNNN — Title

- Status: Accepted | Accepted (known friction)
- Phase: N   ·   Date: YYYY-MM
- Replaces: NNNN (optional — the replaced file is deleted)

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
