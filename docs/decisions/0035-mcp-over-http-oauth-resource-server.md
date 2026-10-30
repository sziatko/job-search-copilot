# 0035 — MCP over HTTP as an OAuth 2.1 resource server

- Status: Accepted · Date: 2026-10

## Context
Claude Desktop runs MCP as a local process over stdio. claude.ai and other remote
clients need HTTP, and the MCP spec makes an HTTP server an OAuth 2.1 resource server:
the client finds the authorization server through RFC 9728 metadata, registers itself
(RFC 7591), and presents a token issued for this server. Google cannot issue that
token.

## Decision
JSC's API is the authorization server: Better Auth's `jwt` + `oauthProvider` plugins
([ADR-0034](0034-auth-better-auth-in-core.md)), dynamic client registration on and
open, a `/consent` page in the web that names the callback host. Since anyone may
register a client and name it anything, a code goes only to a known callback:
claude.ai's, or loopback (`isAllowedRedirectUri` in `create-auth.ts`). `apps/mcp/src/http.ts` serves the same `createServer()` as
Streamable HTTP:

- `/.well-known/oauth-protected-resource` names the API as the authorization server;
- an unauthenticated call → `401` + `WWW-Authenticate: Bearer resource_metadata=…`;
- the JWT access token is checked with `jose` against the API's JWKS (cached):
  `typ: at+jwt`, `iss`, `aud` = the MCP URL, `exp`. An API key (`jsc_…`) is accepted as
  the bearer too ([ADR-0039](0039-api-keys-per-user.md)).

Stdio stays, as the owner of `JSC_API_KEY`.

## Why this and not the alternatives
- **HTTP only** — Claude Desktop would go through OAuth for a server on the same
  machine, and a broken auth server would cut the analyzer off.
- **MCP inside `apps/api`** — mixes Nest's pipeline with the SDK's transport; the tools
  already live in `apps/mcp`.
- **Opaque tokens checked by introspection** — a call to the API per request; a JWT
  against a cached JWKS needs none.

## Consequences
- Any MCP client that speaks the spec connects with no JSC-specific setup.
- A JWT cannot be revoked before it expires: access tokens are short-lived (an hour).
  /profile's "Connected apps" revokes a grant — the consent and the client's tokens for
  that user. The plugin deletes only the consent and its refresh grant never checks
  one, so a `hooks.before` in `create-auth.ts` deletes the tokens.
- claude.ai calls from Anthropic's servers, so it needs a public HTTPS URL — the
  deployed `jsc-mcp.<domain>` ([ADR-0041](0041-one-origin-images-from-ghcr.md)). Locally,
  the MCP Inspector and Claude Code test it.
- A client gets a JWT only when it sends `resource=<MCP_PUBLIC_URL>` (RFC 8707); dynamic
  registration wants `application_type: 'native'` for an `http://localhost` redirect.

## What this constrains — breaks if you change it
- `MCP_PUBLIC_URL` is the token audience and the metadata's `resource`; it must match
  the URL clients call, or every token is refused.
- The stdio entrypoint's key is identity, not network auth: it must never be exposed
  over a network (no wrapping stdio in a socket).
- Both entrypoints share `createServer()`; a tool registered in only one diverges
  ([ADR-0010](0010-mcp-server-factory.md)).
- Rotating the JWKS key invalidates every outstanding token.
- A new remote MCP client (another host than claude.ai) cannot finish OAuth until its
  callback is added to `isAllowedRedirectUri`.
- Scopes are not enforced: one resource, and every tool acts as the user — what
  `/consent` says. A read-only client would need a JSC scope checked in `http-app.ts`.
- The MCP does not check `Origin`: auth is a bearer header, never a cookie, it sends no
  CORS headers, and `Host` is validated (DNS rebinding). A cookie or CORS on it would
  need an `Origin` allowlist first.

## Related
[ADR-0010](0010-mcp-server-factory.md), [ADR-0034](0034-auth-better-auth-in-core.md),
[ADR-0039](0039-api-keys-per-user.md), [`../contracts.md`](../contracts.md) § Over HTTP.
