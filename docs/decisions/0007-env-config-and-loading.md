# 0007 — Validated fail-fast env config + `load-env.ts` loading

- Status: Accepted · Date: 2026-09

## Context
A missing or malformed env var read straight from `process.env` fails late, deep in a
request, with a confusing error. And loading `.env` from a `process.cwd()`-relative
path finds the wrong file, or none, depending on where the process was started.

## Decision
- **Validation.** `apps/api/src/config/env.validation.ts` is a zod schema of every
  variable the API needs (`DATABASE_URL` as a URL, `API_PORT` coerced with a default,
  the auth vars of [ADR-0034](0034-auth-better-auth-in-core.md), …).
  `ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })`
  runs it at boot: a bad value stops the app with a readable message. Code reads
  config through `ConfigService.get(…, { infer: true })`. `apps/mcp/src/env.ts`
  validates its own.
- **Loading.** `apps/api/src/load-env.ts` calls `dotenv` on a **`__dirname`-relative**
  path (the repo-root `.env`), and the entrypoint imports it first, before `AppModule`.
  `apps/mcp/src/env.ts` does the same. `packages/core` loads nothing.

## Why this and not the alternatives
- **Read `process.env` directly** — no fail-fast; `Number("abc") || 3000` is silently
  3000.
- **class-validator for env** — zod fits a flat object better and is already in the
  MCP server and the web.
- **`envFilePath` from `process.cwd()`** — breaks under `npm test` or `node
  dist/main.js` from the repo root. `__dirname` is stable across `nest start`,
  `node dist/main.js` and the swc test run.
- **`core` loads `.env`** — a library should not, and it would tie `core` to the
  repo's directory depth.

## Consequences
- In Docker, Compose injects the vars; `dotenv` never overrides one already set.
- The e2e suite imports `AppModule`, not the entrypoint, so it loads no file: it uses
  the env Vitest injects (`.env.test`, or CI's job env).
- `ConfigService` returns only validated keys: a new var is `undefined` until the
  schema has it.

## What this constrains — breaks if you change it
- A `process.cwd()`-relative `.env` path → runs from the repo root load the wrong file.
- Importing `AppModule` before `./load-env` → `ConfigModule` validates an empty env on
  a host run.
- A new env var not in `env.validation.ts` → `ConfigService` does not return it, and
  boot does not fail when it is missing.

## Related
[ADR-0006](0006-nest-di-prisma-lifecycle.md), `.env.example`, `.env.test.example`.
