# 0010 — MCP `createServer()` factory for in-memory-transport tests

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
The MCP server originally built and connected its `McpServer` inline in `index.ts`,
wired straight to `StdioServerTransport`. That's untestable without spawning a
subprocess and speaking stdio to it.

## Decision
Split the two concerns:

- `apps/mcp/src/server.ts` — `createServer(vacancies = new EstimatedVacancyService())`
  builds an `McpServer` with all four tools registered and returns it, *without*
  connecting a transport. The optional `vacancies` param lets a test inject a
  service bound to its own client.
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
- Removing the `vacancies` parameter from `createServer()` → tests can't inject a
  service; they'd depend on the process-wide lazy client's env being set.
- Renaming a tool or changing an input schema → `apps/mcp/src/server.spec.ts`
  (it calls tools by string name with literal argument objects).

## Related
[ADR-0004](0004-one-service-two-transports.md), [ADR-0015](0015-testing-strategy.md),
[`../contracts.md`](../contracts.md), `apps/mcp/src/server.ts`, `apps/mcp/src/index.ts`.
