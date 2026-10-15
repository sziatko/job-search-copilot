# 0034 — Auth: Better Auth in `core`, cookie sessions, Google/LinkedIn + passkeys

- Status: Accepted · Date: 2026-10

## Context
Sign-in by current standards: social sign-in (Google, LinkedIn), no password, and the
same machinery serving MCP clients as an OAuth 2.1 authorization server
([ADR-0035](0035-mcp-over-http-oauth-resource-server.md)). Invariant 1: only `core`
talks to the database.

## Decision
Better Auth, configured in `packages/core/src/auth/` (`createAuth(prisma, config)`) on
`core`'s Prisma client, its tables in `core`'s schema. `apps/api` mounts it at
`/api/auth/*` through `@thallesp/nestjs-better-auth`, whose global guard closes every
route by default.

- Sign-in: Google and LinkedIn over OIDC (Authorization Code + PKCE); passkeys added on
  `/profile`. No password, no email sending.
- A session is a DB row behind an `HttpOnly; SameSite=Lax` cookie (the BFF pattern):
  the browser never holds a token.
- Sign-up only for `AUTH_ALLOWED_EMAILS` (a `user.create.before` hook).
- Accounts link across providers only on an email the provider has verified.

## Why this and not the alternatives
- **Passport.js** (+ sessions, a WebAuthn library, an OIDC provider) — Passport only
  verifies who came in; sessions, linking, passkeys and the authorization server would
  be four more libraries and the glue, all ours to keep secure.
- **A self-hosted IdP** (Keycloak, Zitadel) — everything built in, but a heavy extra
  service to run, back up and upgrade.
- **SaaS** (Auth0, Clerk) — no ops, but an outside dependency holding the users' data.
- **A JWT in `localStorage`** — readable by any XSS, not revocable before it expires. A
  DB session is revoked by deleting a row.
- **A password** — hashing, rate limiting, email verification and reset (so email
  sending): half the work of auth, for a weaker credential than a passkey.

Moving to an IdP later changes the backend only: the web and MCP clients speak the
standard.

## Consequences
- Little auth code of our own; a provider is config.
- Better Auth is young and moves fast: upgrades need its changelog.
- The NestJS integration is a community package, and it wants Nest's body parser off
  (`bodyParser: false`); the 5 MB JSON limit is set through `AuthModule`'s
  `bodyParser` option. An e2e app must be built the same way (`createTestApp()`).
- Each user sees only their own data ([ADR-0038](0038-multi-user-shared-schema.md));
  the allowlist is the gate on sign-up.

## What this constrains — breaks if you change it
- A second `betterAuth` instance in `apps/api`, on its own client → invariant 1 breaks,
  and so does the test DB's lifecycle.
- A new REST route is closed unless marked `@AllowAnonymous()` (which skips the session
  guard — `ApiKeyGuard` routes use it too, [ADR-0039](0039-api-keys-per-user.md)). A
  truly anonymous route has no user to scope its queries to.
- The allowlist removed → anyone can sign up and store data here.
- A provider added to `trustedProviders` → linking skips the verified-email check, and
  an unverified address there can take over an account.
- `WEB_ORIGIN` must equal the web's origin exactly: it is the CORS allowlist and Better
  Auth's `trustedOrigins`; a mismatch fails every sign-in.
- `PASSKEY_RP_ID` is baked into every stored passkey: a new domain invalidates them all.

## Related
[ADR-0007](0007-env-config-and-loading.md), [ADR-0035](0035-mcp-over-http-oauth-resource-server.md),
[ADR-0039](0039-api-keys-per-user.md).
