# 0014 — Biome + the `apps/api` `useImportType` override

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
No linter or formatter at first — style was consistent only because it was one
author. "Generally accepted standards" wants a shared linter in CI.

## Decision
**Biome** (`biome.json` at the repo root) for lint + format + import sorting, one
tool, one config:
- Formatter: 2-space, width 100, single quotes, trailing commas, semicolons.
- Linter: `preset: "recommended"`.
- `assist.actions.source.organizeImports: "on"`.
- `javascript.parser.unsafeParameterDecoratorsEnabled: true` — so Biome can parse
  NestJS parameter decorators (`@Body()`, `@Param()`, `@Query()`).
- `files.includes` excludes `dist`, `node_modules`, `*.d.ts`, the Prisma
  migrations, and `apps/web/dist`.
- `.gitignore` also ignores stray `*.config.mjs` / `.mjs.map` / `.config.d.ts`
  that `tsc` can emit next to `*.mts` config files.

**The override:**

```jsonc
"overrides": [
  { "includes": ["apps/api/**"],
    "linter": { "rules": { "style": { "useImportType": "off" } } } }
]
```

## Why this and not the alternatives
- **ESLint + Prettier** — two tools, two configs, plugin management, slower. Biome
  is a single dependency and does lint + format + import-sort together.
- **No override, `useImportType` on everywhere** — **this actively broke the app.**
  Biome's autofix converted `import { ConfigService }` /
  `import { EstimatedVacancyService }` / the DTO imports to `import type {...}` in
  `apps/api`, because within each file they're only referenced in type position.
  But NestJS DI and `class-validator` read those types as **runtime** metadata
  (`design:paramtypes` via `emitDecoratorMetadata`) — a `type`-only import is
  erased, so DI resolution fails at boot (`Nest can't resolve dependencies of ...`).
  The e2e suite caught it. `useImportType` cannot know about decorator metadata,
  so it's disabled for `apps/api` (and only there — `apps/mcp` / `apps/web` /
  `packages/core` keep it).

## Consequences
- `npm run lint` / `lint:fix` / `format` at the root; CI runs `lint`.
- `apps/api` imports of DI/DTO classes must stay **value** imports; the linter
  won't rewrite them, but nothing enforces it either — it's a convention backed
  by the e2e boot.
- Biome doesn't lint Markdown, so `docs/` isn't checked by `npm run lint`.

## What this constrains — breaks if you change it
- Turning `useImportType` back on for `apps/api` (removing the override) → the
  autofix silently `type`-ifies runtime-needed imports; DI breaks at boot. Caught
  only by running the app or the e2e suite.
- Removing `unsafeParameterDecoratorsEnabled` → Biome can't parse the NestJS
  controllers; `npm run lint` errors on parameter decorators.
- Removing the `*.config.mjs` `.gitignore` lines → stray `tsc` output next to
  `vitest.config.mts` gets committed (it did once, in commit `cf38caa`, and was
  amended out).

## Related
[ADR-0006](0006-nest-di-prisma-lifecycle.md), [ADR-0015](0015-testing-strategy.md),
`biome.json`, `.gitignore`.
