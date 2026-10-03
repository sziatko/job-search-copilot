# Phase 6: auth — sign-in for the web, MCP over HTTP behind OAuth 2.1

## Goal

JSC has no auth: the REST API is open and MCP speaks stdio only. That blocks everything
that leaves this machine: a deploy, claude.ai reaching MCP over HTTP, multi-user. This
phase adds:

- **sign-in for the web** with Google and LinkedIn (OpenID Connect) and passkeys, kept
  as a session in an `HttpOnly` cookie (the BFF pattern: no token ever reaches the
  browser's JavaScript);
- **every REST route closed by default**, with two exceptions: `/health`, and a static
  machine token for n8n on the intake and analysis routes;
- **JSC as an OAuth 2.1 authorization server**, so an MCP client (Claude, the MCP
  Inspector) can register itself and get a token for JSC;
- **MCP over Streamable HTTP** as an OAuth 2.1 resource server, next to stdio.

Decided with the user on 2026-10-03:

- **Better Auth 1.6, inside JSC** ([ADR-0034](../decisions/0034-auth-better-auth-in-core.md)).
  No separate auth service, no hosted IdP, no Passport. Reuse across the user's other
  projects comes from the standard (each is an OIDC client of whatever issues the
  tokens), not from shared code. Passport would have shown the mechanics more plainly
  but covers only the first of the five pieces below; the section *Under the hood*
  makes up for that.
- **Google + LinkedIn** as social sign-in, both OIDC. GitHub (plain OAuth 2.0, no
  `id_token`) is in the backlog.
- **Passkeys, no password.** An account is created by a social sign-in (the provider
  has already verified the email), then the user adds a passkey on `/profile` and can
  sign in with it. No email is ever sent, so no SMTP / Resend in this phase.
- **Sign-up only for `AUTH_ALLOWED_EMAILS`.** `Vacancy` has no `userId` yet, so any
  signed-in user sees everything. The list goes away with the multi-user row.
- **n8n gets a static bearer token** (`INTAKE_TOKEN`), valid only on
  `POST /vacancies/intake`, `POST /vacancies/analysis` and `POST /vacancies/:id/analysis`
  ([ADR-0036](../decisions/0036-machine-token-for-n8n.md)).
- **stdio MCP stays as it is, with no auth.** It is a local child process of Claude
  Desktop and never listens on a network. HTTP is added next to it
  ([ADR-0035](../decisions/0035-mcp-over-http-oauth-resource-server.md)).

Out of scope, kept in the backlog: deploy and a public HTTPS URL (claude.ai connects to
MCP from Anthropic's servers, so it cannot reach `localhost`), GitHub sign-in, email
sign-in (OTP / magic link), multi-user.

## Under the hood

What the library does on each path, so the code is not a black box. The names in
brackets are the RFCs.

**Social sign-in — Authorization Code + PKCE (OAuth 2.1, OIDC Core).**

1. The web calls `signIn.social({ provider: 'google' })`. The API makes a random
   `state` and a `code_verifier`, stores both (the `Verification` table), and redirects
   the browser to Google with `code_challenge = BASE64URL(SHA256(code_verifier))`,
   `scope=openid email profile` and `redirect_uri = …/api/auth/callback/google`.
2. The user signs in **on Google's site**; JSC never sees that password.
3. Google redirects back with `?code=…&state=…`. The API checks `state` against what
   it stored (CSRF), then posts `code` + `code_verifier` + `client_secret` to Google's
   token endpoint, server to server. A stolen `code` is useless without the verifier.
4. Google returns an `id_token`: a JWT signed with Google's key. The API checks the
   signature (Google's JWKS), `iss`, `aud` (our `client_id`), `exp`, then reads `sub`
   (the stable user id at Google), `email`, `email_verified`.
5. **Find or create the user.** An `Account` row keys `(providerId, accountId = sub)`
   to a `User`. A new email passes the allowlist hook first. If the email already
   belongs to a user (signed in earlier with LinkedIn), the account is **linked** only
   when `email_verified` is true and the provider is in `trustedProviders`; otherwise
   anyone with an unverified address could take over that user.
6. The API writes a `Session` row and sets a cookie: a random token, `HttpOnly`
   (invisible to JavaScript, so XSS cannot steal it), `SameSite=Lax` (not sent on a
   cross-site POST, so CSRF on writes is blocked), `Secure` outside localhost. Google's
   tokens are not kept; JSC never calls Google APIs for the user.

A cookie set by `localhost:3000` is sent from `localhost:5173` too: a cookie's *site*
ignores the port. The web sends `credentials: 'include'`, the API answers CORS with
`credentials: true` and an explicit origin.

**Passkeys — WebAuthn.**

- *Adding* (signed in): the API makes a random challenge; the browser asks the
  authenticator (Touch ID, Windows Hello, a phone) to create a key pair bound to the
  relying party id (`PASSKEY_RP_ID`, `localhost` in dev); the private key never leaves
  the device. The API checks the signed challenge and stores the **public** key in
  `Passkey`.
- *Signing in*: a new challenge; the authenticator signs it with the private key; the
  API verifies it with the stored public key, then creates a session as above. Nothing
  secret is stored on the server, and a phishing site gets nothing: the browser binds
  the signature to the real origin.

**JSC as an authorization server for MCP (OAuth 2.1, RFC 8414, 7591, 9728).**

1. Claude calls `POST /mcp` with no token. The MCP server answers `401` with
   `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`.
2. That document (RFC 9728) names the authorization server: JSC's API. Claude reads
   the API's `/.well-known/oauth-authorization-server` (RFC 8414) for its endpoints.
3. Claude registers itself (Dynamic Client Registration, RFC 7591) and gets a
   `client_id`.
4. Claude runs Authorization Code + PKCE against **JSC**: the user lands on the web's
   `/login` (if not signed in), then `/consent` ("allow Claude to use JSC?").
5. JSC issues an access token: a JWT signed with JSC's own key (the `jwt` plugin's
   `Jwks` table), audience = the MCP URL. The MCP server verifies it against JSC's JWKS
   without a database query, and runs the tool.

Google cannot do this part: it will not issue a token whose audience is JSC's MCP, nor
register Claude as a client. Hence JSC's own authorization server.

## Shape

- **`packages/core/src/auth/`** — `createAuth(prisma, config)` returns the `betterAuth`
  instance: the Prisma adapter on `core`'s client, `google` + `linkedin`, the passkey
  plugin, `jwt` + `oauthProvider` (step 4), `account.accountLinking.trustedProviders`,
  and a `databaseHooks.user.create.before` that rejects an email not in the allowlist.
  Better Auth's tables live in `packages/core/prisma/schema.prisma` (generated by its
  CLI, then reviewed). Every query Better Auth makes runs inside `core`, on `core`'s
  client: invariant 1 holds, amended to name the auth instance.
- **`apps/api`** — `AuthModule.forRoot({ auth })` from `@thallesp/nestjs-better-auth`
  mounts `/api/auth/*` and registers a global guard; `@AllowAnonymous()` on `/health`;
  `MachineTokenGuard` on the three n8n routes. CORS with `credentials: true`; Better
  Auth's `trustedOrigins` = `WEB_ORIGIN`.
- **`apps/web`** — `credentials: 'include'` in `src/lib/api.ts`; `better-auth/react`'s
  client (not a `core` import, so invariant 5 holds); `/login`, `/consent`; a guard in
  the root route's `beforeLoad`; sign-out; a Passkeys section on `/profile` (add, list,
  remove).
- **`apps/mcp`** — `src/http.ts`, a second entrypoint: Streamable HTTP over the existing
  `createServer()` ([ADR-0010](../decisions/0010-mcp-server-factory.md)), the
  protected-resource document, JWT verification against the API's JWKS. `src/index.ts`
  (stdio) is unchanged.
- **Env** (invariant 8): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`,
  `LINKEDIN_CLIENT_SECRET`, `AUTH_ALLOWED_EMAILS`, `PASSKEY_RP_ID`, `INTAKE_TOKEN`;
  for mcp `AUTH_URL`, `MCP_HTTP_PORT`, `MCP_PUBLIC_URL`. Fake values in `.env.example`
  and `.env.test`.
- **A new invariant:** every REST route is closed by default; anonymous access is
  explicit (`@AllowAnonymous()`), machine access is explicit (`MachineTokenGuard`).

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`, ADR-0034/0035/0036, the
  new invariant in `architecture.md` and `CLAUDE.md`, invariant 1 amended; the backlog's
  auth row marked `planned (phase 6)`; new rows for deploy, GitHub sign-in, email
  sign-in. — *2026-10-03.* Docs only; `npm test` 482/482 on the same code (main after
  5.1). Invariants 1 and 9 in `architecture.md` describe the state after steps 1–2;
  until then they describe the plan.

- [ ] **1 · Core: Better Auth.** `better-auth` and `@better-auth/passkey` in `core`;
  `createAuth`; the schema from Better Auth's CLI (User, Session, Account,
  Verification, Passkey) and a migration; the allowlist hook; the config type `core`
  takes (no env read in `core`, invariant 8). Tests on the real test DB: the hook
  rejects an email outside the list and lets one inside through; a user and a session
  are created through the adapter.

- [ ] **2 · API: the guard and the machine token.** The module, CORS with credentials,
  `@AllowAnonymous()` on `/health`, `MachineTokenGuard` (`timingSafeEqual` on
  `INTAKE_TOKEN`; a route it guards accepts a session too), env validation for the new
  vars. **Check first:** the module wants `bodyParser: false`, while `setup-app.ts`
  raises the JSON limit to 5 MB for intake — that limit must survive. Every existing
  e2e test now gets a 401, so a helper signs a test user in (Better Auth's test
  utilities if 1.6 has them, else a `Session` row written in the test DB). New tests:
  401 without a cookie, 200 with one; `/health` anonymous; the three n8n routes 401 /
  401 / 2xx for no token, a wrong token, the right one.

- [ ] **3 · Web: sign-in.** `/login` (Google, LinkedIn, Sign in with a passkey), the
  root guard redirecting to `/login`, sign-out, Passkeys on `/profile`, `credentials`.
  MSW tests: no session → `/login`; the buttons are there. **The user first creates**
  a Google Cloud OAuth client and a LinkedIn app (it must be tied to a LinkedIn Page),
  redirect URIs `http://localhost:3000/api/auth/callback/google` and `…/linkedin`, and
  puts the credentials in `.env`. Then by hand in a browser: Google, then LinkedIn with
  the same email (one user), add a passkey, sign out, sign in with it.

- [ ] **4 · The OAuth 2.1 authorization server.** `jwt` + `oauthProvider` (dynamic
  client registration on), the migration for their tables, `/consent` in the web.
  Tests: `/.well-known/oauth-authorization-server`, a client registered over DCR, the
  JWKS endpoint.

- [ ] **5 · MCP over HTTP.** `apps/mcp/src/http.ts`, its port in `docker-compose.yml`,
  an npm script. **Check first:** how to verify `oauthProvider`'s tokens from a separate
  resource server (Better Auth's helper, or `jose` against the JWKS); how a test gets a
  valid token. Tests: the protected-resource document; 401 with `WWW-Authenticate`;
  `tools/list` with a valid token; a token with another audience refused. By hand: the
  MCP Inspector (phase 5.1) or `claude mcp add --transport http` runs the OAuth flow
  end to end. Update `architecture.md`, `contracts.md`, the root `README.md`. No skill
  changes: no tool or field changes.

## Verification, every step

`npm run lint`, `npm run typecheck`, the full `npm test` (the real test DB, invariant 7).
After step 5, end to end: sign in with Google, then LinkedIn with the same email (one
user); add a passkey and sign in with it; `curl POST /vacancies/intake` without a token
→ 401, with `INTAKE_TOKEN` → 201; the MCP Inspector at `http://localhost:<MCP_HTTP_PORT>/mcp`
→ sign-in and consent → `tools/list`; stdio MCP in Claude Desktop works as before.
