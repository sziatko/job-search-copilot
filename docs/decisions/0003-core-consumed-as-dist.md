# 0003 — Apps consume `core` as compiled `dist/`

- Status: Accepted (known friction)
- Phase: 1 · Date: 2026-09

## Context
`apps/api` and `apps/mcp` import `@job-search-copilot/core`. npm resolves that to
the package's `main`/`types`, which point at `packages/core/dist/` (the `tsc`
output). So the apps see *compiled JavaScript + `.d.ts`*, not the TypeScript
source.

## Decision
Keep it that way for Phase 1. `packages/core` has `build` (`tsc`) and `watch`
(`tsc --watch`) scripts; in Docker a dedicated `core` service runs the watcher so
`dist/` stays fresh. The apps' own watchers (`nest start --watch`, `tsx watch`)
compile only their own `src/`.

## Why this and not the alternatives
- **tsconfig `paths` → `core/src` + an swc/tsx runner** — the fully-correct fix
  that removes the rebuild step. But it means dropping `nest start --watch` (Nest
  doesn't transpile `.ts` from a dependency) and reworking the dev runner and the
  Docker `core` service. Deferred — the user hadn't evaluated the tradeoffs and
  didn't want to commit mid-Phase-1.
- **TS project references (`composite: true`)** — helps cross-package *typecheck*
  staleness, but the apps still consume `core` via its emitted `.d.ts`, so the
  runtime rebuild/restart friction stays. Not worth the config churn for only
  half the benefit.

## Consequences
- **The friction:** after editing `packages/core`, `apps/api` / `apps/mcp` don't
  pick it up until `dist/` is rebuilt *and* their process restarts —
  `docker compose restart api mcp`.
- CI and the Docker build order `core` before the apps.
- `packages/core` is publishable as-is if that's ever wanted.

## What this constrains — breaks if you change it
- Removing the `core` build watcher from `docker-compose.yml` without switching to
  a `paths`→`src` setup → the apps run against a stale `dist/` after any `core`
  edit.
- Pointing `core`'s `package.json` `main`/`types` at `src/` → Node can't run `.ts`
  directly; `apps/api`'s production `node dist/main.js` breaks.

## Related
The open question is tracked in the memory file
`project_core_dist_open_question` and in
[`../../packages/core/README.md`](../../packages/core/README.md) ("Build strategy").
[ADR-0001](0001-monorepo-npm-workspaces.md), [ADR-0016](0016-docker-dev-stack-and-ci.md).
