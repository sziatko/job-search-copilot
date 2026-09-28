# 0007 — Validated fail-fast env config + `load-env.ts` loading

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
Two problems from the early scaffold:

1. **No validation.** `main.ts` read `process.env.API_PORT` directly
   (`Number(...) || 3000`); `PrismaService` read `DATABASE_URL` directly. A
   missing or malformed var surfaced as a confusing runtime error deep in a
   request, not at boot.
2. **Fragile loading.** `packages/core` loaded the repo-root `.env` itself via a
   hard-coded `../../../.env`, and later `apps/api` used
   `ConfigModule({ envFilePath: path.resolve(process.cwd(), '../../.env') })`.
   `process.cwd()` is only `apps/api` under `npm run dev:api`; under `npm test` or
   `node dist/main.js` from the repo root it resolved to a path *outside* the
   repo — env silently not loaded, or a stray `~/Desktop/.env` picked up.

## Decision
- **Validation:** `apps/api/src/config/env.validation.ts` holds a `zod` schema
  (`DATABASE_URL` as `z.url()`, `API_PORT` coerced int default 3000,
  `CORS_ORIGINS` default `''`) and exports `validateEnv()`. `ConfigModule.forRoot({
  isGlobal: true, ignoreEnvFile: true, validate: validateEnv })` runs it at boot;
  a bad value throws a readable multi-line message and the app doesn't start.
  `main.ts` and `PrismaService` read via `ConfigService.get(..., { infer: true })`.
- **Loading:** `apps/api/src/load-env.ts` calls `dotenv` with a
  **`__dirname`-relative** path (`path.resolve(__dirname, '../../../.env')`), and
  `main.ts` imports it as its *first* import, before `AppModule`. `apps/mcp` does
  the same via `apps/mcp/src/env.ts`. `packages/core` loads nothing.

## Why this and not the alternatives
- **Keep reading `process.env` directly** — no fail-fast, and the `API_PORT`
  `Number(...) || 3000` footgun (`"abc" → 3000` silently).
- **`class-validator` for env** — already an `apps/api` dep, but `zod` is cleaner
  for a flat config object and is already used in `apps/mcp` / `apps/web`.
- **`ConfigModule` `envFilePath` from `process.cwd()`** — the bug above. A
  `__dirname`-relative path is stable across `nest start`, `node dist/main.js`
  from anywhere, and the swc-transpiled test run.
- **`core` loads `.env`** — a library shouldn't; and it tied `core` to the
  monorepo's directory depth.

## Consequences
- `main.ts` owns env loading for host dev; Docker Compose injects the vars and the
  file simply isn't there (`ignoreEnvFile: true`, `dotenv` no-ops).
- The e2e suite imports `AppModule` (not `main.ts`), so it never loads a file —
  it relies purely on the `DATABASE_URL` Vitest injects into `process.env`. Fully
  deterministic.
- `ConfigService` only exposes the four validated keys — `z.object()` strips
  unknowns. This is deliberate (explicit config), but `config.get('SOMETHING_NEW')`
  returns `undefined` until it's added to the schema.

## What this constrains — breaks if you change it
- Re-adding `envFilePath` from `process.cwd()`, or moving the `dotenv` call to a
  `process.cwd()`-relative path → host `npm test` / repo-root `node` runs load the
  wrong file (or none).
- Importing `AppModule` before `./load-env` in `main.ts` → `PrismaService` reads
  `DATABASE_URL` before it's populated on a bare host run.
- Adding an env var without adding it to `env.validation.ts` → `ConfigService`
  won't return it, and boot won't fail if it's missing.
- Making `packages/core` load `.env` again → re-couples the library to the
  monorepo layout; import-time side effects return.

## Related
[ADR-0006](0006-nest-di-prisma-lifecycle.md), `apps/api/src/load-env.ts`,
`apps/api/src/config/env.validation.ts`, `apps/mcp/src/env.ts`, `.env.example`.
