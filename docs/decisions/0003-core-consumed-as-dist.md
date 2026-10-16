# 0003 — Apps consume `core` as compiled `dist/`

- Status: Accepted (known friction) · Date: 2026-09

## Context
`apps/api` and `apps/mcp` import `@job-search-copilot/core`, which npm resolves to the
package's `main` / `types`: `packages/core/dist/`, the `tsc` output.

## Decision
The apps run `core`'s compiled JavaScript and `.d.ts`. `core` has `build` and `watch`
scripts; in Docker a `core` service runs the watcher, so `dist/` stays fresh. The apps'
own watchers compile only their own `src/`.

## Why this and not the alternatives
- **tsconfig `paths` → `core/src` with an swc / tsx runner** — removes the rebuild,
  but `nest start --watch` does not transpile a dependency's `.ts`, so the dev runner
  and the Docker setup change with it. Not done yet.
- **TS project references** — fix cross-package typecheck staleness, but the apps
  still run the emitted output, so the restart stays.

## Consequences
- After a `core` edit the apps keep the old modules in memory until restarted:
  `docker compose restart core api mcp mcp-http`.
- CI and the Docker build build `core` first.
- `npm test` does not typecheck `core` (vitest strips types): `npm run typecheck` does.

## What this constrains — breaks if you change it
- Removing the `core` watcher without moving to `paths` → the apps run a stale `dist/`.
- Pointing `main` / `types` at `src/` → Node cannot run `.ts`; the API's production
  `node dist/main.js` breaks.

## Related
The backlog's "`core` dev-loop friction" row, [ADR-0001](0001-monorepo-npm-workspaces.md),
[ADR-0016](0016-docker-dev-stack-and-ci.md).
