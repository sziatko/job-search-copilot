# 0036 — n8n reaches the API with a static bearer token, on three routes only

- Status: Accepted
- Phase: 6   ·   Date: 2026-10

## Context
Phase 5 built `POST /vacancies/intake` for n8n, and `POST /vacancies/analysis` /
`POST /vacancies/:id/analysis` for a scoring flow in n8n. n8n has no browser, so it
cannot hold a session cookie, and the global guard of
[ADR-0034](0034-auth-better-auth-in-core.md) closes those routes.

## Decision
`MachineTokenGuard` accepts `Authorization: Bearer <INTAKE_TOKEN>`, compared with
`crypto.timingSafeEqual`, on those three routes only; they accept a session too. The
token is an env var, validated at boot (min length), rotated by changing it.

## Why this and not the alternatives
- **Better Auth's API-key plugin** — keys in the DB, several of them, scopes, revocation
  and a UI to manage them: built for many machine clients. There is one.
- **OAuth client credentials against JSC's authorization server** — standard, but n8n
  would fetch and refresh a token before each run, for the same trust level.
- **Leave the routes open until the n8n workflows exist** — an open write endpoint the
  day the API goes public.

## Consequences
- A few lines of code, no table.
- One secret for every n8n workflow: a leak means rotating it everywhere at once.

## What this constrains — breaks if you change it
- The token opens these three routes only. Putting `MachineTokenGuard` on a read route
  turns a write-only secret into a key to all the data.
- A plain `===` comparison leaks the token's prefix by timing; keep `timingSafeEqual`
  (with a length check first).
- n8n workflows read the token from their own credentials store; renaming the header or
  the scheme breaks them.

## Related
[ADR-0033](0033-unscored-vacancies-in-one-table.md),
[ADR-0034](0034-auth-better-auth-in-core.md), [`../phases/phase-6.md`](../phases/phase-6.md).
