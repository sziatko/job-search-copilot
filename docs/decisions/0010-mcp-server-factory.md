# 0010 — MCP `createServer()` factory for in-memory-transport tests

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
The MCP server originally built and connected its `McpServer` inline in `index.ts`,
wired straight to `StdioServerTransport`. That's untestable without spawning a
subprocess and speaking stdio to it.

## Decision
Split the two concerns:

- `apps/mcp/src/server.ts` — `createServer(vacancies = new VacancyService(),
  applications = new ApplicationService())` builds an `McpServer` and returns it,
  *without* connecting a transport. The optional params let a test inject services
  bound to their own client. The nine tools themselves are registered by two
  per-feature functions this file composes — `registerVacancyTools(server,
  vacancies)` in `vacancies/vacancies.tools.ts` (5 tools) and
  `registerApplicationTools(server, applications)` in
  `applications/applications.tools.ts` (4 tools) — each with a sibling
  `*.schemas.ts` for its zod input shapes. `server.ts` itself stays composition
  only; it does not know what a tool looks like.
- `apps/mcp/src/index.ts` — the entrypoint: `import './env'` first, then
  `createServer()`, then connect a `StdioServerTransport`, then `main().catch`.

Tests (`apps/mcp/src/server.spec.ts`) connect a real MCP `Client` to
`createServer()` over `InMemoryTransport.createLinkedPair()` — the SDK's own
recommended way — and call each tool by name, asserting on the real
`registerTool` handlers, input schemas, and `isError` shapes.

## Why this and not the alternatives
- **Test by spawning the stdio process** — slow, flaky, and hard to assert on
  structured results; you're testing the transport, not the handlers.
- **Unit-test the handler functions directly** — would require exporting each
  handler and re-implementing the SDK's input parsing in the test; the in-memory
  transport exercises the schema validation and result envelope for free.
- **Mock the MCP SDK** — re-asserts our own calls; breaks on SDK updates.

## Consequences
- The tool handlers, their `zod` input schemas, and the error envelopes are all
  covered by fast in-process tests against the real test DB.
- `index.ts` stays a ~15-line entrypoint.

## What this constrains — breaks if you change it
- Moving tool registration back into `index.ts` → the in-memory-transport tests
  can't reach the handlers.
- Removing the `vacancies` / `applications` parameters from `createServer()` →
  tests can't inject a service; they'd depend on the process-wide lazy client's
  env being set.
- Renaming a tool or changing an input schema → `apps/mcp/src/server.spec.ts`
  (it calls tools by string name with literal argument objects).
- Adding a third domain should get its own `<feature>/` folder and
  `register<Feature>Tools(server, service)` function, composed into
  `createServer()` the same way — not appended into an existing feature's file.

## Related
[ADR-0004](0004-one-service-two-transports.md), [ADR-0015](0015-testing-strategy.md),
[`../contracts.md`](../contracts.md), `apps/mcp/src/server.ts`, `apps/mcp/src/index.ts`.
