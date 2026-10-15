# 0009 — Domain errors → 422 filter; shared `configureApp()`

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
`normalizeRecommendation()` threw a plain `Error`. If it ever reached the HTTP
layer unmapped, Nest would turn it into a `500` — wrong, it's a caller mistake.
The MCP server, meanwhile, handled not-found gracefully (`isError` result) but let
a bad recommendation throw. Inconsistent handling of "the caller sent something
invalid" across the two transports.

Separately, the e2e test set up its `ValidationPipe` by hand in `beforeAll`, so it
could silently drift from what `main.ts` configured.

## Decision
- **`DomainError`** base class in `packages/core/src/domain/errors.ts` (with
  `InvalidRecommendationError`). It marks *caller mistakes* — not bugs, not infra
  failures. `normalizeRecommendation()` throws `InvalidRecommendationError`.
- **`apps/api`** — `DomainExceptionFilter` (`@Catch(DomainError)`) maps it to
  `422 { statusCode, error: exception.name, message }`, registered globally.
- **`apps/mcp`** — the `save` tool catches `DomainError` and returns an `isError`
  result (consistent with the not-found tools); anything else re-throws.
- **`configureApp(app, config)`** (`apps/api/src/setup-app.ts`) — the single place
  that wires CORS, the global prefix + versioning, the `ValidationPipe`, the
  `DomainExceptionFilter`, and `enableShutdownHooks()`. `main.ts` and the e2e
  `beforeAll` both call it.

## Why this and not the alternatives
- **Let it 500** — a caller mistake reported as a server error is misleading and
  un-actionable.
- **Per-transport ad-hoc handling** — the inconsistency this ADR removes; a new
  domain error would need remembering in two places.
- **Duplicate the pipe/filter setup in the e2e test** — guaranteed drift; the
  bug this ADR's `configureApp()` half prevents.

Note: the 422 path is currently **unreachable over HTTP** — the `save` DTO's
`@IsIn(RECOMMENDATION_INPUT_VALUES)` rejects a bad recommendation with a `400`
first. The filter is defence-in-depth for any future `DomainError` that isn't
pre-validated by a DTO.

## Consequences
- A new domain rule = a new `DomainError` subclass; both transports map it
  correctly for free.
- The e2e suite runs against byte-for-byte the same app wiring as production.

## What this constrains — breaks if you change it
- Throwing a non-`DomainError` for a caller mistake in `core` → the filter won't
  catch it; it becomes a `500` (API) or an unhandled throw (MCP).
- Removing `configureApp()` from the e2e `beforeAll` → the tests stop exercising
  the real pipes/filters/routing.
- Adding a new global pipe/filter/interceptor only in `main.ts` and not in
  `configureApp()` → the e2e suite doesn't see it.

## Related
[ADR-0008](0008-api-prefix-and-versioning.md), [`../contracts.md`](../contracts.md),
`packages/core/src/domain/errors.ts`, `apps/api/src/common/domain-exception.filter.ts`,
`apps/api/src/setup-app.ts`.
