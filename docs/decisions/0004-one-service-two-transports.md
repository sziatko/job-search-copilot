# 0004 — One domain service, two transports (REST + MCP)

- Status: Accepted · Date: 2026-09

## Context
Two very different clients need the same operations:

- **the web app** — a browser: HTTP, JSON, CORS, cookies;
- **Claude**, driven by the owner's skills — MCP, wanting the operations as *tools*.

n8n, a third client, speaks plain HTTP and uses the REST API.

## Decision
Two thin transport apps over `core`'s services ([ADR-0002](0002-core-shared-domain-layer.md)):

- `apps/api` — NestJS REST: DTO validation, versioned routes, a health check
  ([ADR-0008](0008-api-prefix-and-versioning.md));
- `apps/mcp` — the MCP SDK, over stdio and Streamable HTTP: `registerTool` calls, zod
  input schemas, JSON text results ([ADR-0010](0010-mcp-server-factory.md)).

Neither holds business logic. They shape responses differently — HTTP status codes
against `isError` tool results — over the same service call.

## Why this and not the alternatives
- **One transport only** — Claude would lose MCP's tools, or the browser would need
  an MCP client it does not have.
- **MCP proxying REST** — an extra hop and a second place for auth and errors to go
  wrong, with both on the same box against the same DB.

## Consequences
- A new operation is a service method, a route and/or a tool, and their tests.
- The surfaces may differ (MCP's `save_vacancy` answers `{ success }`; REST answers
  `201` / `200`) as long as the service call is the same.

## What this constrains — breaks if you change it
- A rule that must hold for both, put in one transport only (analyze-once, the status
  rules, the user scoping) → the other transport diverges. It goes in `core`.
- A third transport → a thin adapter over the same services too.

## Related
[ADR-0005](0005-analyze-once.md), [`../contracts.md`](../contracts.md).
