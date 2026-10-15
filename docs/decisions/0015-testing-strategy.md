# 0015 — Integration tests, not mocked Prisma; a real test DB

- Status: Accepted · Date: 2026-09

## Context
The domain layer is mostly Prisma queries, Postgres constraints and a few pure
functions. What should the tests exercise, and against what?

## Decision
- **Vitest**, with a root `vitest.config.mts` fanning out to one project per workspace
  (`core`, `api`, `mcp`, `web`), each with its own environment: `node` for the three
  back ends, `jsdom` for the web; `api` transforms with `unplugin-swc` for
  `emitDecoratorMetadata`. The configs are `.mts`: the root has no `"type": "module"`,
  and `.mts` opts one file into ESM without forcing it on the Nest and `tsc` builds.
- **Integration, not mocks.** `core`'s specs run against a real Postgres, the
  `job_search_copilot_test` database. The API's e2e specs boot the real `AppModule`
  and call it over HTTP with `supertest`. The MCP spec drives `createServer()` over an
  in-memory transport ([ADR-0010](0010-mcp-server-factory.md)). The web uses MSW as a
  fake API, not a `fetch` mock.
- **The env** — each back-end project sets `env: loadEnv('test', rootDir, '')`, so
  `.env.test`'s `DATABASE_URL` is what the tests see; CI sets the same in its job env.
  A shared setup file, first in each project's `setupFiles`, refuses to start unless
  the database name ends in `_test` (`vitest.test-db.ts`).
- **Serial files.** `fileParallelism: false`: every DB-backed file cleans up with a
  blanket `deleteMany()` in `afterEach`, so parallel files would wipe each other's rows.
- **`isolate: false`** in each project: one environment and module cache per project,
  not one per file — about 40% faster. The price: state can leak between files.
- File names follow each ecosystem: `*.spec.ts` in the back ends, `*.test.ts(x)` in the
  web.

## Why this and not the alternatives
- **Mocked Prisma** — tests assert our own query calls, break on every refactor, and
  never catch a constraint, a race or a migration. The `matchScore` CHECK, the unique
  race in `save()`, the trigram search cannot be tested against a mock.
- **SQLite in memory** — enums, `ILIKE`, `pg_trgm`, `@db.Text` don't map; a different
  database.
- **A transaction per test, rolled back** — would allow parallel files, but wraps every
  test, and the services open their own transactions. Not worth it at this size.

## Consequences
- `npm test` needs a running Postgres and a migrated test DB (`npm run
  test:db:migrate`); CI provisions one.
- Slower than unit tests, but they catch real breakage.
- A new migration must reach the test DB, or the suite fails.

## What this constrains — breaks if you change it
- `fileParallelism` on → DB files race on cleanup; flaky failures.
- With `isolate: false`, a `vi.mock`, a stubbed global or module state left by one file
  is still there for the next. A test that fails in the full run but passes alone is
  the symptom: clean up in the file that set it.
- The `_test` guard removed from `setupFiles` → a missing `.env.test` points the tests'
  `deleteMany()` at the dev DB.
- `apps/api/tsconfig.build.json` (or its `test` / spec excludes) removed → `nest build`
  pulls in `test/**` and fails on `rootDir: ./src`.

## Related
[ADR-0016](0016-docker-dev-stack-and-ci.md), [ADR-0037](0037-e2e-playwright.md),
`vitest.config.mts`, `packages/core/tests/setup.ts`, `apps/web/src/test/`.
