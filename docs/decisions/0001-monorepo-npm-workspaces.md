# 0001 — Monorepo, npm workspaces

- Status: Accepted · Date: 2026-09

## Context
Three apps (REST API, MCP server, web) and a domain layer two of them share. They
change together, have one developer, and share a schema and a TypeScript config.

## Decision
One repository, npm workspaces: `apps/*` for the apps, `packages/*` for shared code.
The root `package.json` holds the workspace list and the cross-cutting scripts; one
lockfile, one hoisted `node_modules`, one `tsconfig.base.json` every package extends.

## Why this and not the alternatives
- **Separate repos and a published `core`** — a schema change would be publish, bump
  and install across three repos, for a project with no outside consumers.
- **One flat package** — the web (browser) and the API (Node, Prisma, decorators) need
  different `tsconfig`s and dependency sets.
- **pnpm / yarn workspaces** — npm's are built in: nothing extra in every container.

## Consequences
- One install, one lockfile, a schema change and all its consumers in one commit.
- `core` is consumed as `dist/`, with the friction in [ADR-0003](0003-core-consumed-as-dist.md).
- The Dockerfiles copy every workspace `package.json` before `npm ci`, so the layer
  cache survives source-only changes.

## What this constrains — breaks if you change it
- A workspace's name (`@job-search-copilot/*`) → every cross-package import, the
  Dockerfiles' `COPY` lines, the `--workspace=` flags in the root scripts.
- A new package → the root `workspaces`, the Dockerfiles, `vitest.config.mts`'
  `projects`.

## Related
[ADR-0002](0002-core-shared-domain-layer.md), [ADR-0003](0003-core-consumed-as-dist.md),
`package.json`, `tsconfig.base.json`.
