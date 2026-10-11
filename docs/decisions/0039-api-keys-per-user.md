# 0039 — API keys per user, for n8n and MCP

- Status: Accepted
- Phase: 7   ·   Date: 2026-10
- Replaces: 0036 (deleted in phase 7 step 2, with `MachineTokenGuard`)

## Context
Once every vacancy has an owner ([ADR-0038](0038-multi-user-shared-schema.md)), every
writer must say whose rows it touches. The browser has a session; an MCP-over-HTTP
client has an OAuth token issued to an account ([ADR-0035](0035-mcp-over-http-oauth-resource-server.md)).
Two writers have no user: n8n, with one static `INTAKE_TOKEN`, and the stdio MCP, with
no auth at all. A client that cannot do OAuth — Claude Desktop through `mcp-remote`, a
script — needs a credential too.

## Decision
Better Auth's `@better-auth/api-key` plugin in `createAuth`: keys owned by a user
(`referenceId`), stored hashed, prefix `jsc_`, shown once, managed on `/profile`
(create, list, revoke). No expiry, no per-key scopes, rate limit off. A key is accepted:
- on the three machine REST routes (`POST /vacancies/intake`, `/vacancies/analysis`,
  `/vacancies/:id/analysis`), by `ApiKeyGuard`, as `Authorization: Bearer jsc_…` — the
  header n8n already sends;
- by the HTTP MCP, as a bearer next to the OAuth JWT (a `jsc_` prefix picks the path);
- by the stdio MCP, from `JSC_API_KEY`, verified once at boot.

Core exports `verifyApiKey(prisma, key) → userId | null`, so both apps verify through
`core` (invariant 1). `enableSessionForAPIKeys` stays off.

## Why this and not the alternatives
- **A hand-rolled key table** (prefix, SHA-256 hash, last used) — small, but Better
  Auth already owns auth here, and the plugin brings the create / list / revoke
  endpoints with ownership checks.
- **Keep `INTAKE_TOKEN` and add a user id next to it** — still one secret for every
  user and every workflow.
- **OAuth client credentials for n8n** — standard, but n8n would fetch and refresh a
  token before each run, for the same trust.
- **Per-key scopes** — one more choice in the UI and in every guard, for two kinds of
  client. Revisit with a third.
- **The plugin's rate limit** — 10 requests a day by default, copied onto each key at
  creation; a scoring run is about a hundred MCP calls. It does nothing against a
  leaked key; revoking does.
- **The MCP verifies keys by calling the API** — a network hop per request, and a
  second way to reach the DB's data.

## Consequences
- n8n swaps the token's value for a key; the header and scheme stay.
- One leaked key is one user's data, and it is revoked on its own.
- `verifyApiKey` writes `lastRequest` on every call: a DB write per MCP request.
- A key checked at boot stays valid in a running stdio process until it restarts.

## What this constrains — breaks if you change it
- **A key is full access to its owner's data through MCP** (`list_vacancies`,
  `get_vacancy` read everything). Keeping keys off the REST reads is hygiene, not the
  security boundary; do not argue from it.
- **stdio + a key is identity, not security.** Whoever runs stdio holds `DATABASE_URL`
  and can read every user's rows. stdio is for the owner's own machine; anyone else
  uses the HTTP MCP with a key.
- Turning on `enableSessionForAPIKeys` lets a key into every REST route.
- The HTTP MCP must give a key an `authInfo.expiresAt` (now + 60 s): the SDK's
  `requireBearerAuth` refuses one without it.
- The verify-only Better Auth instance in `core` uses a random `secret`; it must never
  sign or issue anything, or that would not verify anywhere else.
- Renaming the header, the scheme or the `jsc_` prefix breaks n8n's credential and the
  HTTP MCP's routing between a key and a JWT.

## Related
[ADR-0034](0034-auth-better-auth-in-core.md), [ADR-0035](0035-mcp-over-http-oauth-resource-server.md),
[ADR-0038](0038-multi-user-shared-schema.md), [`../phases/phase-7.md`](../phases/phase-7.md).
