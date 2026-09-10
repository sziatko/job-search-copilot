# 0001 — Monorepo, npm workspaces

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
Three deployable apps (REST API, MCP server, web UI) plus shared domain code that
at least two of them need. They evolve together, are developed by one person, and
share a database schema and TypeScript config.

## Decision
A single repository with npm workspaces: `apps/*` for the deployables,
`packages/*` for shared libraries. Root `package.json` holds the workspace list
and the cross-cutting scripts (`test`, `lint`, `typecheck`, `build`, `generate`,
`migrate:dev`). One `package-lock.json`, one `node_modules` (hoisted), one
`tsconfig.base.json` that every package extends.

## Why this and not the alternatives
- **Separate repos + a published `core` package** — versioning and release
  overhead for a solo project with no external consumers; a schema change would
  mean publish + bump + install across three repos.
- **A single flat package** — `apps/web` (browser) and `apps/api` (Node + Prisma)
  have incompatible `tsconfig` needs (`lib`, `module`, decorators) and dependency
  sets; one package can't express both.
- **pnpm / yarn workspaces** — npm workspaces are built in, no extra tool to
  install in every container. The tradeoff (less strict hoisting isolation)
  showed up once as [ADR-0014](0014-biome-and-nest-di-import-type.md)-adjacent
  install quirks, but nothing blocking.

## Consequences
- One `npm install`, one lockfile, atomic cross-package changes in a single commit.
- `packages/core` is consumed via its `main`/`types` (`dist/`), which creates the
  build-ordering friction documented in [ADR-0003](0003-core-consumed-as-dist.md).
- Docker builds copy every workspace `package.json` before `npm ci` so the layer
  cache survives source-only changes.

## What this constrains — breaks if you change it
- Renaming a workspace or its package name (`@job-search-copilot/*`) → every
  cross-package import, the Docker `COPY` lines, and the `--workspace=` flags in
  root scripts.
- Adding a package → root `package.json` `workspaces`, the Dockerfiles' per-package
  `COPY`, and `vitest.config.mts` `projects`.
- Splitting to multiple repos → `core` must become a versioned published package
  and every "single commit changes schema + all consumers" flow breaks.

## Related
[ADR-0002](0002-core-shared-domain-layer.md), [ADR-0003](0003-core-consumed-as-dist.md),
`package.json`, `tsconfig.base.json`, `docker-compose.yml`.
