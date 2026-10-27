# Architecture Decision Records

One file per decision other code depends on, describing it as it stands. A small
choice (a status code, an index type) is a section of
[`architecture.md`](../architecture.md), [`domain-model.md`](../domain-model.md) or
[`contracts.md`](../contracts.md) instead.

| ADR | Decision |
| --- | --- |
| [0001](0001-monorepo-npm-workspaces.md) | Monorepo, npm workspaces |
| [0002](0002-core-shared-domain-layer.md) | `packages/core` as a framework-agnostic shared domain layer |
| [0003](0003-core-consumed-as-dist.md) | Apps consume `core` as compiled `dist/` (known friction) |
| [0004](0004-one-service-two-transports.md) | One domain service, two transports (REST + MCP) |
| [0005](0005-analyze-once.md) | Analyze-once: an analysis is written once, never overwritten |
| [0006](0006-nest-di-prisma-lifecycle.md) | Nest DI end-to-end + `PrismaService` connection lifecycle |
| [0007](0007-env-config-and-loading.md) | Validated fail-fast env config + `load-env.ts` loading |
| [0008](0008-api-prefix-and-versioning.md) | `/api/v1` prefix, URI versioning, version-neutral `/health` |
| [0009](0009-domain-errors-and-configure-app.md) | Domain errors → a 422 filter; one shared `configureApp()` |
| [0010](0010-mcp-server-factory.md) | MCP `createServer()` factory for in-memory-transport tests |
| [0011](0011-web-tanstack-query.md) | Web data layer: TanStack Query + optimistic mutations |
| [0012](0012-web-hand-written-contract.md) | Web keeps a hand-written zod API contract (no `core` import) |
| [0013](0013-accessible-ui-primitives.md) | Accessible UI primitives: `Modal`, `ExpandableText` |
| [0014](0014-biome-and-nest-di-import-type.md) | Biome + the `apps/api` `useImportType` override |
| [0015](0015-testing-strategy.md) | Integration tests, not mocked Prisma; a real test DB |
| [0016](0016-docker-dev-stack-and-ci.md) | Docker Compose dev stack + CI pipeline |
| [0019](0019-record-or-create-vacancy.md) | Recording an application find-or-creates the `Vacancy` |
| [0020](0020-web-router-tanstack.md) | Web router: `@tanstack/react-router`; TanStack Form deferred |
| [0022](0022-timeout-derived-until-scheduled.md) | Timeout is derived in `core`, not stored |
| [0023](0023-canonical-applyurl.md) | `applyUrl` is stored canonicalized: the query dropped, except where a site rule defines it |
| [0024](0024-web-shell-and-theme.md) | The web app shell and the theme |
| [0025](0025-vacancies-list-search-server-side.md) | The vacancies list: server-side search, a derived company count |
| [0027](0027-linkedin-site-rule.md) | LinkedIn site rule: one key per job id, locale host merged |
| [0029](0029-one-vacancy-table.md) | One `Vacancy` table: one status, a `StatusChange` journal, comments with a `source` |
| [0030](0030-cursor-paging.md) | Every list pages by a Prisma cursor |
| [0031](0031-stats-endpoint.md) | One stats endpoint; the funnel counts the journal |
| [0032](0032-same-company-normalised-name.md) | Same company = an equal normalised name |
| [0033](0033-unscored-vacancies-in-one-table.md) | Unscored vacancies live in `Vacancy`: `NEW` and `FILTERED_OUT` |
| [0034](0034-auth-better-auth-in-core.md) | Auth: Better Auth in `core`, cookie sessions, Google/LinkedIn + passkeys |
| [0035](0035-mcp-over-http-oauth-resource-server.md) | MCP over HTTP as an OAuth 2.1 resource server |
| [0037](0037-e2e-playwright.md) | End-to-end tests: Playwright on its own database, run on demand |
| [0038](0038-multi-user-shared-schema.md) | Multi-user: one schema, `userId` on `Vacancy`, every query through `forUser` |
| [0039](0039-api-keys-per-user.md) | API keys per user, for n8n and MCP |
| [0040](0040-machine-moves-queue-to-unavailable.md) | A machine moves only the queue, to `UNAVAILABLE` |
| [0041](0041-one-origin-images-from-ghcr.md) | One origin through Caddy, images from GHCR, the migration as a one-shot service |

A missing number (0017, 0018, 0021, 0026, 0028, 0036) is a deleted ADR. The one that
replaced it names it on its `Replaces:` line; `git log --all -- 'docs/decisions/NNNN-*'`
shows the old text.

## Template

```markdown
# NNNN — Title

- Status: Accepted · Date: YYYY-MM
- Replaces: NNNN (optional — the replaced file is deleted)

## Context
The problem and the constraints that force a choice.

## Decision
What is chosen, as it stands.

## Why this and not the alternatives
The other options, and why each lost.

## Consequences
What the decision buys; what it costs.

## What this constrains — breaks if you change it
Concrete "change X → Y breaks" statements, naming real files and behaviours.

## Related
Other ADRs, the code involved.
```

When a decision changes, edit its ADR to say what holds now; replace it with a new
number only when the decision itself is a different one.
