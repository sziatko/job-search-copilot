# 0035 — MCP over HTTP as an OAuth 2.1 resource server; stdio stays open

- Status: Accepted
- Phase: 6   ·   Date: 2026-10

## Context
MCP is stdio only ([ADR-0004](0004-one-service-two-transports.md)): Claude Desktop
spawns it as a local process. claude.ai and other remote clients need HTTP, and the MCP
spec requires an HTTP server to be an OAuth 2.1 resource server: the client finds the
authorization server through RFC 9728 metadata, registers itself (RFC 7591), and
presents a token issued for this server. Google cannot issue that token.

## Decision
JSC's API is the authorization server: Better Auth's `jwt` + `oauthProvider` plugins
([ADR-0034](0034-auth-better-auth-in-core.md)), with dynamic client registration on and
a `/consent` page in the web. `apps/mcp` gains a second entrypoint, `src/http.ts`:
Streamable HTTP over the same `createServer()`, serving
`/.well-known/oauth-protected-resource`, answering an unauthenticated call with
`401` + `WWW-Authenticate: Bearer resource_metadata=…`, and verifying the JWT access
token against the API's JWKS (audience = the MCP URL). `src/index.ts` (stdio) stays,
with no auth.

## Why this and not the alternatives
- **HTTP only** — one path, but Claude Desktop would go through OAuth for a server on
  the same machine, and a broken auth server would cut the analyzer off.
- **MCP inside `apps/api`** — one process fewer, but mixes Nest's request pipeline
  with the MCP SDK's transport, and the MCP tools already live in `apps/mcp`.
- **Opaque tokens checked by introspection** — a call to the API per request; a JWT
  checked against a cached JWKS needs none.
- **Better Auth's `mcp` plugin** — deprecated in favour of `oauthProvider`.

## Consequences
- Any MCP client that speaks the spec connects with no JSC-specific setup.
- A JWT cannot be revoked before it expires; access tokens are kept short-lived.
- claude.ai reaches MCP from Anthropic's servers: it needs a public HTTPS URL, which is
  the deploy row in the backlog. Locally, the MCP Inspector and Claude Code test it.

## What this constrains — breaks if you change it
- `MCP_PUBLIC_URL` is the token audience and the `resource` in the metadata; it must
  match the URL clients call, or every token is refused.
- The stdio entrypoint has no auth: it must never be exposed over a network (no
  wrapping it in a socket or `supergateway`).
- Both entrypoints share `createServer()`; a tool registered only in one diverges
  ([ADR-0010](0010-mcp-server-factory.md)).
- Rotating the JWKS key invalidates every outstanding MCP token.

## Related
[ADR-0004](0004-one-service-two-transports.md), [ADR-0010](0010-mcp-server-factory.md),
[ADR-0034](0034-auth-better-auth-in-core.md), [`../phases/phase-6.md`](../phases/phase-6.md).
