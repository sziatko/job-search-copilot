# 0034 — Auth: Better Auth in `core`, cookie sessions, Google/LinkedIn + passkeys

- Status: Accepted
- Phase: 6   ·   Date: 2026-10

## Context
The REST API is open; nothing may leave this machine until it is not. The user wants
sign-in by current standards: social sign-in (Google, LinkedIn), no password, and the
same machinery later serving MCP clients as an OAuth 2.1 authorization server
([ADR-0035](0035-mcp-over-http-oauth-resource-server.md)). One user today; multi-user
is a backlog row. Invariant 1 says only `core` talks to the database.

## Decision
Better Auth 1.7, configured in `packages/core/src/auth/` (`createAuth(prisma, config)`)
on `core`'s Prisma client, with its tables in `core`'s schema. `apps/api` mounts it at
`/api/auth/*` through `@thallesp/nestjs-better-auth`, whose global guard closes every
route by default. Sign-in: Google and LinkedIn over OIDC (Authorization Code + PKCE),
then passkeys added on `/profile`; no password, no email sending. A session is a DB row
behind an `HttpOnly; SameSite=Lax` cookie (the BFF pattern); the browser never holds a
token. Sign-up only for `AUTH_ALLOWED_EMAILS` (a `user.create.before` hook). Accounts
link across providers only on a verified email from a trusted provider.

## Why this and not the alternatives
- **Passport.js (+ express-session, @simplewebauthn, oidc-provider)** — Passport only
  verifies who came in. Sessions, account linking, passkeys and the authorization
  server for MCP would be four more libraries and the glue between them, all ours to
  keep secure. More to learn from, roughly twice the phase.
- **A self-hosted IdP (Keycloak, Zitadel, Authentik)** — everything built in and SSO
  across the user's projects, but a heavy extra service to run, back up and upgrade,
  for one user.
- **An auth service written from scratch** — the most learning and the most security
  risk; not for real use.
- **SaaS (Auth0, Clerk, WorkOS)** — no ops, but an outside dependency holding the
  user's data, with free-tier limits.
- **JWT in `localStorage`** — readable by any XSS, and not revocable before it expires.
  A DB session is revoked by deleting a row.
- **A password** — needs hashing (argon2id), rate limiting, email verification and
  reset, so email sending: half the work of auth, for a weaker credential than a
  passkey.

Reuse in other projects comes from the standard: each is an OIDC client of whoever
issues tokens. Moving to an IdP later changes the backend only.

## Consequences
- Little code of ours; Google and LinkedIn are config.
- Better Auth is young and moves fast (its `mcp` plugin was deprecated within a minor
  release); upgrades need reading the changelog.
- The NestJS integration is a community package, and it wants Nest's body parser off.
- The allowlist is a stopgap for the missing `userId`.

## What this constrains — breaks if you change it
- Better Auth's queries run inside `core` on `core`'s client. Building a second
  `betterAuth` instance in `apps/api` with its own client breaks invariant 1 and the
  test DB's lifecycle.
- A new REST route is closed unless marked `@AllowAnonymous()` or guarded by
  `ApiKeyGuard` ([ADR-0039](0039-api-keys-per-user.md)). Marking one anonymous
  exposes data: `Vacancy` has no owner.
- Removing the allowlist before `userId` lands gives every new account all the data.
- Account linking is left empty of `trustedProviders`: an account links to an existing
  user only when the provider says `email_verified`. Adding a trusted provider skips
  that check and lets an unverified address there take over the account.
- `WEB_ORIGIN` must equal the web's origin exactly: it is both the CORS allowlist and
  Better Auth's `trustedOrigins`; a mismatch fails every sign-in with a CSRF error.
- `PASSKEY_RP_ID` is baked into every stored passkey; changing the domain invalidates
  them all.

## Related
[ADR-0002](0002-core-shared-domain-layer.md), [ADR-0007](0007-env-config-and-loading.md),
[ADR-0035](0035-mcp-over-http-oauth-resource-server.md),
[ADR-0039](0039-api-keys-per-user.md), [`../phases/phase-6.md`](../phases/phase-6.md).
