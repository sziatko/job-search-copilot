# 0039 — API keys per user, for n8n and MCP

- Status: Accepted · Date: 2026-10
- Replaces: 0036

## Context
Once every vacancy has an owner ([ADR-0038](0038-multi-user-shared-schema.md)), every
writer must say whose rows it touches. The browser has a session; an MCP-over-HTTP
client has an OAuth token issued to an account ([ADR-0035](0035-mcp-over-http-oauth-resource-server.md)).
Two writers have no user of their own: n8n and the stdio MCP. A client that cannot do
OAuth — Claude Desktop through `mcp-remote`, a script — needs a credential too.

## Decision
Better Auth's `@better-auth/api-key` plugin in `createAuth`: keys owned by a user
(`referenceId`), stored hashed, prefix `jsc_`, shown once, managed on `/profile`
(create, list, revoke). No expiry, no per-key scopes. A rate limit of 1000 requests an
hour per key, set in `API_KEY_OPTIONS` (`core/src/auth/api-key.ts`); a key over it is a
`429` on REST and the HTTP MCP. A key is accepted:
- on the domain REST routes (`/vacancies`, `/applications`, `/stats`), by `ApiKeyGuard`
  on each controller's class, as `Authorization: Bearer jsc_…`; a comment a key writes
  is `AGENT`;
- by the HTTP MCP, as a bearer next to the OAuth JWT (a `jsc_` prefix picks the path);
- by the stdio MCP, from `JSC_API_KEY`, verified once at boot.

Core exports `verifyApiKey(prisma, key) → userId | null`, so both apps verify through
`core` (invariant 1); a key over its limit throws `RateLimitedError`.
`enableSessionForAPIKeys` stays off.

## Why this and not the alternatives
- **A hand-rolled key table** (prefix, SHA-256 hash, last used) — small, but Better
  Auth already owns auth here, and the plugin brings the create / list / revoke
  endpoints with ownership checks.
- **One shared machine token** — one secret for every user and every workflow, and no
  owner for what it writes.
- **OAuth client credentials for n8n** — standard, but n8n would fetch and refresh a
  token before each run, for the same trust.
- **Per-key scopes** — one more choice in the UI and in every guard, for two kinds of
  client. Revisit with a third.
- **No rate limit** — what this ADR first chose: the plugin's default, 10 requests a
  day, would stop a scoring run of about a hundred MCP calls, and a limit does nothing
  against a leaked key; revoking does. But a looping agent or n8n flow then writes
  without end. 1000 an hour is ten scoring runs, far above real use.
- **The api's own throttle (`@nestjs/throttler`)** — REST only, in memory per process;
  the plugin's limit is in the key's row, so REST and the MCP share one count.
- **Keys on the three n8n write routes only** — what this ADR first said, as hygiene.
  A key already reads and writes everything through MCP, so the narrow scope protected
  nothing, and n8n could not read the queue it was meant to clean up.
- **The MCP verifies keys by calling the API** — a network hop per request, and a
  second way to reach the DB's data.

## Consequences
- One leaked key is one user's data, and it is revoked on its own.
- `verifyApiKey` writes `lastRequest` and `requestCount` on every call: a DB write per
  request with a key.
- The window restarts only after an hour with no request at all — each request moves
  `lastRequest` — so the limit is 1000 calls per busy stretch, not per clock hour.
- A key checked at boot stays valid in a running stdio process until it restarts.
- The limit is a key's: an OAuth client on the HTTP MCP (claude.ai) has none. A looping
  agent there is stopped by revoking it on `/profile` (Connected apps), not by a 429.

## What this constrains — breaks if you change it
- **A key is full access to its owner's data**, through MCP and REST alike. The
  boundary is the owner (invariant 11) and revoking; a route without a key is not one.
- `ApiKeyGuard` sits on the domain controllers' classes, not app-wide: a new
  controller is closed to keys until it opts in.
- **stdio + a key is identity, not security.** Whoever runs stdio holds `DATABASE_URL`
  and can read every user's rows. stdio is for the owner's own machine; anyone else
  uses the HTTP MCP with a key.
- Turning on `enableSessionForAPIKeys` lets a key into every REST route, `/api/auth/*`
  and any new controller included.
- The HTTP MCP checks a key in its own middleware, before the SDK's
  `requireBearerAuth`: that one answers any error but a bad token with a 400 or a 500,
  never a 429.
- The plugin copies the limit onto a key when it is created and reads it from the row
  after that: changing `API_KEY_OPTIONS` reaches old keys only through a migration
  that updates their rows (as `20261025120000_api_key_rate_limit` did).
- The verify-only Better Auth instance in `core` uses a random `secret`; it must never
  sign or issue anything, or that would not verify anywhere else.
- Renaming the header, the scheme or the `jsc_` prefix breaks n8n's credential and the
  HTTP MCP's routing between a key and a JWT.

## Related
[ADR-0034](0034-auth-better-auth-in-core.md), [ADR-0035](0035-mcp-over-http-oauth-resource-server.md),
[ADR-0038](0038-multi-user-shared-schema.md).
