# 0009 — Domain errors → a 422 filter; one shared `configureApp()`

- Status: Accepted · Date: 2026-09

## Context
A caller's mistake (an unknown status, a repeat, a vacancy already applied to) must
not reach a client as a `500`, and must look the same over REST and MCP. And an e2e
suite that wires its own pipes drifts from production.

## Decision
- **`DomainError`** (`packages/core/src/domain/errors.ts`) is the base of every
  caller-mistake error core throws: `InvalidRecommendationError`, `SameStatusError`,
  `AnalysedNotNewError`, `AlreadyAnalysedError`, `AlreadyAppliedError`,
  `AmbiguousVacancyMatchError`, `VacancyNotFoundError`, … Not bugs, not infra failures.
- **REST** — `DomainExceptionFilter` (`@Catch(DomainError)`) answers
  `{ statusCode, error: <name>, message }`: `422`, unless its `STATUS_OF` map says
  otherwise (`AlreadyAnalysedError` → `409`, `VacancyNotFoundError` → `404`).
- **MCP** — a tool catches a `DomainError` and returns an `isError` result; anything
  else re-throws.
- **Not found** — a query (`getById`) answers `null` and the caller decides; a command
  (a status move, an edit, a comment) throws `VacancyNotFoundError`.
- **`configureApp(app, config)`** (`apps/api/src/setup-app.ts`) is the one place that
  wires CORS, the prefix and versioning, the `ValidationPipe`, the filter, Swagger and
  the shutdown hooks. The entrypoint and the e2e `createTestApp()` both call it.

## Why this and not the alternatives
- **Let it 500** — misleading and not actionable for the caller.
- **Handling per transport** — a new error has to be remembered in two places.
- **Pipes set up by hand in the tests** — guaranteed drift from production.

## Consequences
- A new rule is a new `DomainError` subclass; both transports map it for free.
- A DTO often refuses bad input first with a `400` (e.g. `@IsEnum(Recommendation)`);
  the filter covers what only core can know.
- The e2e suite runs the production wiring.

## What this constrains — breaks if you change it
- A caller mistake thrown as a plain `Error` in core → a `500` over REST, an unhandled
  throw over MCP.
- A global pipe, filter or interceptor added only in `main.ts` → the e2e suite does
  not see it.

## Related
[ADR-0008](0008-api-prefix-and-versioning.md), [`../contracts.md`](../contracts.md),
`apps/api/src/common/domain-exception.filter.ts`.
