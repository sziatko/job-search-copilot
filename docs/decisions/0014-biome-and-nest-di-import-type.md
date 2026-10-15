# 0014 — Biome + the `apps/api` `useImportType` override

- Status: Accepted · Date: 2026-09

## Context
The repo needs one linter and formatter, run in CI. And NestJS reads the types of
constructor parameters and DTO fields at **runtime** (`emitDecoratorMetadata`), which
a type-only import erases.

## Decision
**Biome** (`biome.json`) does lint, format and import sorting:
- 2-space indent, width 100; `preset: "recommended"`; `organizeImports` on;
- `javascript.parser.unsafeParameterDecoratorsEnabled: true`, so it parses NestJS's
  parameter decorators (`@Body()`, `@Param()`);
- `files.includes` leaves out `dist`, `node_modules`, `*.d.ts`, the Prisma migrations,
  `docs/design`.

**The override** — in `apps/api` only, `style.useImportType` is `off`:

```jsonc
"overrides": [
  { "includes": ["apps/api/**"],
    "linter": { "rules": { "style": { "useImportType": "off" } } } }
]
```

Within a file, `ConfigService`, a service or a DTO class is often referenced only in a
type position, so the rule's autofix rewrites it to `import type`. Nest then cannot
resolve the dependency at boot (`Nest can't resolve dependencies of …`). `apps/mcp`,
`apps/web` and `packages/core` keep the rule.

## Why this and not the alternatives
- **ESLint + Prettier** — two tools, two configs, plugins, slower.
- **The rule on everywhere** — breaks DI, as above; the rule cannot know about
  decorator metadata.

## Consequences
- `npm run lint` / `lint:fix` / `format` at the root; CI runs `lint`.
- In `apps/api`, DI and DTO classes stay value imports. Nothing enforces it but the
  e2e suite booting the app.
- Biome does not lint Markdown.
- `.gitignore` covers the stray `*.config.mjs` / `*.config.d.mts` that `tsc` can emit
  next to `*.mts` configs.

## What this constrains — breaks if you change it
- The override removed → the autofix type-ifies runtime imports; DI breaks at boot,
  caught only by running the app or the e2e suite.
- `unsafeParameterDecoratorsEnabled` removed → Biome cannot parse the controllers.

## Related
[ADR-0006](0006-nest-di-prisma-lifecycle.md), `biome.json`.
