# 0012 — Web keeps a hand-written zod API contract (no `core` import)

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
`apps/web` needs the TypeScript shape of what the API returns. `packages/core`
already has `VacancyListItem` and the enums. The obvious move is to
import them.

## Decision
Don't. `apps/web/src/pages/vacancies/types.ts` defines `zod` schemas
(`recommendationSchema`, `vacancyStatusSchema`, `vacancyListItemSchema`,
`listResponseSchema`) by hand; the TS types are `z.infer`'d from them.
`apps/web/src/pages/vacancies/api.ts` parses **every** response through them
(`parseResponse()` — logs the detail, throws a short message). The file carries a
comment saying exactly this and why.

## Why this and not the alternatives
- **`import { VacancyListItem } from '@job-search-copilot/core'`** —
  `core`'s entrypoint pulls in `@prisma/client` and `pg`. Even a type-only import
  risks a bundler following the module graph; and it couples the browser build to
  a Node/DB package. Not worth it.
- **Generate the client from an OpenAPI spec** — no OpenAPI spec exists;
  generating one from Nest + wiring codegen is more machinery than a
  ~25-line schema file needs at this size.
- **Trust `res.json()` as the typed shape (the original code)** — no runtime
  check; a backend shape change surfaces as `undefined` deep in the UI.

## Consequences
- **Accepted parallel maintenance:** a field added to the API list-item shape must
  be added to `VacancyListItem` + `LIST_SELECT` in `core` **and** to
  `vacancyListItemSchema` here. This is the one place the repo tolerates
  hand-kept duplication.
- The web build never sees Prisma/pg.
- Since phase 5.1 an OpenAPI document exists (`/api/docs-json`, from `@nestjs/swagger`),
  built for browsing the API, not for codegen. The web still does not generate from it;
  the "no OpenAPI spec" argument above is out of date, the rest stands.
- Runtime validation: a contract drift fails loudly (`parseResponse` throws) with
  a user-readable message, and the mismatch is logged in full.

## What this constrains — breaks if you change it
- Importing from `@job-search-copilot/core` in `apps/web` → Prisma/pg enter the
  browser bundle (or the build fails); the boundary this ADR draws is gone.
- Changing the API response shape without updating this schema → `parseResponse`
  throws "the server returned data in an unexpected format" (intended failure
  mode — fix the schema).
- Adding an enum value in `core` without adding it here → `recommendationSchema` /
  `vacancyStatusSchema` reject the new value; the row fails to parse.

## Related
[ADR-0011](0011-web-tanstack-query.md), [`../contracts.md`](../contracts.md)
("Web ↔ API contract"), [`../domain-model.md`](../domain-model.md) (enum-change
checklist), `apps/web/src/pages/vacancies/types.ts`.
