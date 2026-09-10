# 0015 — Integration tests, not mocked Prisma; real test DB; Vitest workspace projects

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
The domain layer is almost entirely Prisma queries and a few pure functions. What
should the tests actually exercise, and against what?

## Decision
- **Vitest** with a root `vitest.config.mts` that fans out to per-workspace
  `projects` (`packages/core`, `apps/api`, `apps/mcp`, `apps/web`), each keeping
  its own environment and setup: `node` for core/api/mcp, `jsdom` for web; `api`
  uses the `unplugin-swc` transform so `emitDecoratorMetadata` works. The config
  files are `.mts`, not `.ts`: the repo root has no `"type": "module"`, so a
  `.ts` Vitest config loads as CommonJS and Vite 8 warns; `.mts` opts that one
  file into ESM without forcing `"type": "module"` on the Nest / `tsc` builds.
- **Integration, not mocks.** The core service spec runs against a **real**
  Postgres database — the separate `job_search_copilot_test` DB (`.env.test`).
  Its own comment: *"A mocked Prisma client would just re-assert our own query
  calls and break on every harmless refactor — the DB round-trip is what actually
  matters."* The API e2e boots the real `AppModule` and hits it over HTTP with
  `supertest`. The MCP spec drives `createServer()` over an in-memory transport
  ([ADR-0010](0010-mcp-server-factory.md)).
- **Serial execution.** `fileParallelism: false` at the root — every DB-backed
  file cleans up with a blanket `deleteMany()` in `afterEach`, so running files in
  parallel would let one file's cleanup wipe rows another is mid-assertion on. The
  config comment notes the alternative (per-test rolled-back transactions) was
  considered and judged not worth it at this suite size.
- **Vitest env injection.** Each project's config does
  `env: loadEnv('test', rootDir, '')`, so `.env.test`'s `DATABASE_URL` (the test
  DB) is what the tests see; `process.env` still passes through, which is how CI
  supplies it with no `.env.test` file present.
- **File-name convention:** core/api/mcp use `*.spec.ts`, web uses `*.test.ts(x)`
  — each follows its ecosystem's default (Nest scaffolds `*.spec.ts`, Vitest +
  React examples `*.test.tsx`). The split is incidental, not a designed
  cross-cutting rule; nothing depends on it beyond each project's own `include`
  glob.
- **web** tests use MSW (`apps/web/src/test/msw/`) as a fake API server, not a
  fetch mock.

Phase 1 ends at **48 tests / 6 files**, all green.

## Why this and not the alternatives
- **Mock Prisma** — tests would assert the shape of our own query calls, break on
  every refactor, and never catch a real SQL/constraint/migration problem. The
  `matchScore` CHECK, the `@unique` race handling, the `pg_trgm` filter — none of
  those are testable against a mock.
- **In-memory SQLite** — Postgres-specific features (enums, `ILIKE`, `pg_trgm`,
  `@db.Text`) don't map; you'd be testing a different database.
- **Parallel files with a shared DB** — the cleanup race above. Per-test
  transactions would fix it but add a wrapper to every test for a suite this size.

## Consequences
- `npm test` **requires** a running Postgres and a migrated
  `job_search_copilot_test` DB (`npm run test:db:migrate`). CI provisions this as
  a service.
- Tests are slower than unit tests (real I/O, serial) but catch real breakage.
- A new migration must be applied to the test DB or the suite fails.

## What this constrains — breaks if you change it
- Turning on `fileParallelism` (or removing the root config's `false`) → DB-backed
  test files race on cleanup; flaky failures.
- Running `npm test` without the test DB up / migrated → every DB-backed suite
  errors on connect.
- Adding a migration and not running `npm run test:db:migrate` (locally) — CI runs
  `prisma migrate deploy` itself, so CI would still pass while local fails.
- Renaming test files away from the `*.spec.ts` / `*.test.ts(x)` convention →
  the project `include` globs stop matching them.
- Removing `apps/api/tsconfig.build.json` (or its `test` / `*.spec.ts` /
  `vitest.config.mts` excludes) → `nest build` falls back to `tsconfig.json`,
  pulls in `test/**` and the Vitest config, and fails on the `rootDir: ./src`
  constraint. `nest build` auto-selects `tsconfig.build.json` when it exists.

## Related
[ADR-0010](0010-mcp-server-factory.md), [ADR-0016](0016-docker-dev-stack-and-ci.md),
`vitest.config.mts`, `packages/core/tests/setup.ts`, `apps/web/src/test/`,
`.env.test`.
