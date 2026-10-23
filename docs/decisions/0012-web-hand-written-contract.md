# 0012 — Web keeps a hand-written zod API contract (no `core` import)

- Status: Accepted · Date: 2026-09

## Context
`apps/web` needs the shape of what the API returns. `packages/core` already has
`VacancyListItem`, `ApplicationListItem` and the enums; the obvious move is to import
them.

## Decision
Don't. `apps/web/src/lib/*/types.ts` define zod schemas of the API's JSON by hand;
the TypeScript types are `z.infer`red from them, and every response is parsed through
them (`parseResponse()` in `apps/web/src/lib/api.ts`: it logs the detail and throws a
short message).

## Why this and not the alternatives
- **Import core's types and enums.** A type-only import is erased at build time, so it
  would not bundle Prisma by itself. But it would not do the job either:
  - the enums (`Recommendation`, `VacancyStatus`) are runtime values from
    `@prisma/client`; importing those does pull Prisma toward the browser bundle;
  - core's types describe Prisma rows, not the JSON: dates arrive as strings, and the
    derived fields are absent from some responses (the `PATCH …/status` answer), which
    the web schema must say with `.optional()`;
  - a type checks nothing at runtime; the schema catches a drifted response with a
    readable error instead of an `undefined` deep in the UI;
  - the web's typecheck would depend on core's build and a generated Prisma client.
- **Generate a client from the OpenAPI document** (`/api/docs-json`) — the document
  covers requests only (responses are untyped), and codegen is more machinery than a
  few schema files need.

## Consequences
- **Accepted parallel maintenance:** a field added to an API response goes into
  core's type and select **and** the web schema. The one place the repo keeps
  hand-written duplication.
- `apps/api/test/contract.e2e.spec.ts` parses the real API's responses with the web's
  schemas, so a drift fails a test, not only the app.
- The web build never sees Prisma or `pg`.

## What this constrains — breaks if you change it
- Importing `@job-search-copilot/core` in `apps/web` → Prisma enters the browser
  bundle, or the build fails.
- An API shape changed without the schema → the contract test fails; in the app,
  `parseResponse` throws "unexpected format". Fix the schema.
- An enum value added in core but not here → the web rejects the row.

## Related
[`../contracts.md`](../contracts.md) § Web ↔ API contract, the "Adding a value"
checklists in [`../domain-model.md`](../domain-model.md).
