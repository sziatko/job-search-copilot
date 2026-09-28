# 0004 — One domain service, two transports (REST + MCP)

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
Two very different clients need the same four operations:

- **The web dashboard** — a browser, so it needs HTTP + JSON + CORS.
- **The analyzer** — Claude running the `vacancy-match-analyzer` prompt, which
  talks MCP over stdio and wants the operations as *tools*.

## Decision
Two thin transport apps over the single `VacancyService`
([ADR-0002](0002-core-shared-domain-layer.md)):

- `apps/api` — NestJS REST. DTO validation (`class-validator`), versioned routes,
  a health check. See [ADR-0008](0008-api-prefix-and-versioning.md).
- `apps/mcp` — `@modelcontextprotocol/sdk` server on `StdioServerTransport`. Four
  `registerTool` calls, `zod` input schemas, results as JSON text. See
  [ADR-0010](0010-mcp-server-factory.md).

Neither contains business logic. Response shaping differs (HTTP status codes vs
`isError` tool results) but the decisions behind that shaping live in `core` or in
their own ADRs.

## Why this and not the alternatives
- **One transport only** — the analyzer would have to speak HTTP (no MCP tool
  ergonomics, no direct Claude integration), or the web app would have to speak
  MCP (no browser MCP client). Neither is acceptable.
- **The MCP server proxying the REST API** — an extra network hop and a second
  place for auth/CORS/errors to go wrong, for zero benefit since both run on the
  same box against the same DB.
- **Business logic duplicated per transport** — the thing
  [ADR-0002](0002-core-shared-domain-layer.md) exists to prevent.

## Consequences
- Adding an operation = one `VacancyService` method + one controller
  route + one MCP tool + tests for each. Predictable.
- The two transports can disagree on surface details (MCP `save` returns
  `{ created, vacancy }` as text; REST returns the vacancy with a 201/200 status)
  as long as the underlying service call is identical.

## What this constrains — breaks if you change it
- Putting a decision that should be shared (e.g. analyze-once) into one transport
  only → the other transport diverges. Analyze-once lives in `save()`
  ([ADR-0005](0005-analyze-once.md)); both transports inherit it.
- Adding a third transport → it must also be a thin adapter over
  `VacancyService`; if it needs new behaviour, that behaviour goes in
  `core`, not the transport.

## Related
[ADR-0002](0002-core-shared-domain-layer.md), [ADR-0005](0005-analyze-once.md),
[ADR-0008](0008-api-prefix-and-versioning.md), [ADR-0010](0010-mcp-server-factory.md),
[`../contracts.md`](../contracts.md).
