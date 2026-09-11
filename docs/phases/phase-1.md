# Phase 1 — foundation

## Goal
Stand up the whole system end to end: somewhere to store analysed vacancies, two
ways to write to it (the analyzer via MCP, a human via the web UI), and the UI
itself — built to a senior-engineer bar (DI, validated config, real tests, CI,
accessibility), not a prototype bar.

## Scope delivered

On `main`, commits `8ef089d` … `006f8bb` (this docs commit included):

| Commit | What landed |
| --- | --- |
| `8ef089d` | npm-workspaces monorepo scaffold: shared tsconfig, Biome, Vitest aggregator, docker-compose dev stack, CI workflow |
| `b685209` | `packages/core` — Prisma schema + 7 migrations, `EstimatedVacancyService`, recommendation normalization, `DomainError`, integration tests |
| `cf38caa` | `apps/api` — NestJS REST over the core service, DI, DTO validation, `/health`, e2e tests, Dockerfile |
| `f9aba4d` | `apps/mcp` — MCP server, four tools, `createServer()` factory, in-memory-transport tests |
| `87037b8` | `apps/web` — React 19 + Vite + Tailwind dashboard, MSW-backed hook tests |
| `a38d4b4` | root `README.md` |
| `cfc612a` | Round 2 — stable env loading, `save()` → `{ created, vacancy }`, POST `201`/`200` + `Location` |
| `7efcba8` | Round 2 — `ExpandableText` (replaces the per-row tooltip), response validation, `Modal` a11y |

Between the initial five feature commits and the two `Round 2` commits there was a
**24-point solution-architect review** and its fixes (folded into the feature
commits before they were made) and then a **re-review** (the two `Round 2`
commits). Both are fully on `main`.

## Status at end of Phase 1

- `npm test` → **48 passed, 6 files** (core service 11 · recommendation 8 · api e2e
  12 · mcp 6 · web `useVacancies` 8 · web `ExpandableText` 3).
- `npm run lint` → **0 errors, 0 warnings**.
- `npm run typecheck` → clean across all four workspaces.
- `npm run build` → all workspaces build; CI green.
- Live stack verified: `POST` new → `201 + Location`, `POST` duplicate → `200`;
  API boots with the validated-config path.

## Decisions introduced this phase

All 16 ADRs are Phase 1:
[0001](../decisions/0001-monorepo-npm-workspaces.md) ·
[0002](../decisions/0002-core-shared-domain-layer.md) ·
[0003](../decisions/0003-core-consumed-as-dist.md) ·
[0004](../decisions/0004-one-service-two-transports.md) ·
[0005](../decisions/0005-analyze-once.md) ·
[0006](../decisions/0006-nest-di-prisma-lifecycle.md) ·
[0007](../decisions/0007-env-config-and-loading.md) ·
[0008](../decisions/0008-api-prefix-and-versioning.md) ·
[0009](../decisions/0009-domain-errors-and-configure-app.md) ·
[0010](../decisions/0010-mcp-server-factory.md) ·
[0011](../decisions/0011-web-tanstack-query.md) ·
[0012](../decisions/0012-web-hand-written-contract.md) ·
[0013](../decisions/0013-accessible-ui-primitives.md) ·
[0014](../decisions/0014-biome-and-nest-di-import-type.md) ·
[0015](../decisions/0015-testing-strategy.md) ·
[0016](../decisions/0016-docker-dev-stack-and-ci.md)

## Deferred (Phase 2 candidates)

| Item | Why deferred | Tracked in |
| --- | --- | --- |
| **`core` dev-loop friction** — apps consume `core` via `dist/`, so a `core` edit needs a rebuild + `restart api mcp`. Candidate fixes: tsconfig `paths` → `src` + swc/tsx runner, or TS project references. | User hasn't evaluated the tradeoffs; didn't want to commit mid-phase. | [ADR-0003](../decisions/0003-core-consumed-as-dist.md), memory `project_core_dist_open_question`, `packages/core/README.md` |
| ~~**`ApplyDialog` form fields**~~ — **done in Phase 2.** `salary` / `usedTailoredResume` / `comment` now persist via `POST /api/v1/applications` (see [`phase-2.md`](phase-2.md), [ADR-0017](../decisions/0017-application-1to1-delta.md)). | — | — |
| **CI `docker build` step** — build the production Dockerfile stages in CI to catch `COPY`/dependency regressions. | Low payoff at the scaffold stage; adds minutes/run. | [ADR-0016](../decisions/0016-docker-dev-stack-and-ci.md) |
| **`applyUrl` not URL-validated at the API layer** — the `save` DTO uses `@IsString @IsNotEmpty`, not `@IsUrl` (the MCP schema does validate it). | Not raised as a problem; the analyzer always sends a real URL. | [`../contracts.md`](../contracts.md) |

## Explicitly decided *against* (not deferred)

- **`fullText` in a 1:1 side table** — Postgres TOAST already stores it out-of-line
  and `LIST_SELECT` projects it out. [`../domain-model.md`](../domain-model.md).
- **An analysis-history table** — a single-user tool that analyses each URL once
  doesn't need the audit trail. [ADR-0005](../decisions/0005-analyze-once.md).
