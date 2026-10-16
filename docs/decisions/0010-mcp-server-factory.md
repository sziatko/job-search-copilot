# 0010 — MCP `createServer()` factory for in-memory-transport tests

- Status: Accepted · Date: 2026-09

## Context
An MCP server built and connected inline in its entrypoint is testable only by
spawning a process and speaking stdio to it. And two entrypoints (stdio and HTTP) need
the same tools.

## Decision
- `apps/mcp/src/server.ts` — `createServer({ userId, vacancies?, applications?,
  intake? })` builds an `McpServer` for one user and returns it **without** a
  transport. The services default to ones on the shared lazy client; a test injects
  its own. The file only composes: each feature registers its tools —
  `registerVacancyTools`, `registerApplicationTools`, `registerIntakeTools`, in
  `<feature>/<feature>.tools.ts`, with a sibling `*.schemas.ts` for the zod inputs.
- `apps/mcp/src/index.ts` (stdio) — loads env, resolves the owner of `JSC_API_KEY`,
  `createServer({ userId })`, connects a `StdioServerTransport`.
- `apps/mcp/src/http.ts` (HTTP), over the testable `http-app.ts` — a fresh
  `createServer` per request, for the token's user
  ([ADR-0035](0035-mcp-over-http-oauth-resource-server.md)).

`apps/mcp/src/server.spec.ts` connects a real MCP `Client` to `createServer()` over
`InMemoryTransport.createLinkedPair()` and calls each tool by name, against the real
test DB.

## Why this and not the alternatives
- **Spawning the stdio process in tests** — slow, flaky, and it tests the transport,
  not the handlers.
- **Unit-testing exported handlers** — would re-implement the SDK's input parsing;
  the in-memory transport covers the schemas and the result envelope for free.
- **Mocking the SDK** — re-asserts our own calls and breaks on SDK updates.

## Consequences
- Every tool's handler, schema and error envelope is covered by fast in-process tests.
- The entrypoints are a few lines each.

## What this constrains — breaks if you change it
- Tool registration back in an entrypoint → the tests cannot reach it, and the other
  entrypoint loses it.
- Dropping the injectable services → tests depend on the process-wide client's env.
- A tool's name or input → `server.spec.ts` (it calls tools by name with literal
  arguments) and the skills that call it.
- A new feature → its own `<feature>/` folder and `register<Feature>Tools`, composed in
  `createServer()`.

## Related
[ADR-0004](0004-one-service-two-transports.md), [ADR-0015](0015-testing-strategy.md),
[`../contracts.md`](../contracts.md).
