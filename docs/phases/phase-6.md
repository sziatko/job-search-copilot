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

- **Better Auth 1.7, inside JSC** ([ADR-0034](../decisions/0034-auth-better-auth-in-core.md)).
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
   when `email_verified` is true. No provider is in `trustedProviders` (a trusted
   provider skips the `email_verified` check), so anyone with an unverified address
   cannot take over that user. If LinkedIn ever sends no `email_verified`, the second
   sign-in fails instead of linking; the fix then is linking from a signed-in session
   (`linkSocial`), not trusting the provider.
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
  plugin, `jwt` + `oauthProvider` (step 4), account linking on `email_verified` only,
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
  the `beforeLoad` of a pathless layout route (`_app`, the shell) that holds every page
  but `/login`; sign-out; a Passkeys section on `/profile` (add, list, remove).
- **`apps/mcp`** — `src/http.ts`, a second entrypoint: Streamable HTTP over the existing
  `createServer()` ([ADR-0010](../decisions/0010-mcp-server-factory.md)), the
  protected-resource document, JWT verification against the API's JWKS. `src/index.ts`
  (stdio) is unchanged.
- **Env** (invariant 8): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`,
  `LINKEDIN_CLIENT_SECRET`, `AUTH_ALLOWED_EMAILS`, `PASSKEY_RP_ID`, `INTAKE_TOKEN`,
  `MCP_PUBLIC_URL` (the tokens' audience; one `.env` value for both apps); for mcp
  `AUTH_URL` (where it fetches the JWKS), `MCP_HTTP_PORT`, `MCP_PUBLIC_URL`, and
  `BETTER_AUTH_URL` (the issuer; in Docker `AUTH_URL` is `http://api:3000`, which is
  not the public URL the tokens name). Fake values in `.env.example` and
  `.env.test`.
- **A new invariant:** every REST route is closed by default; anonymous access is
  explicit (`@AllowAnonymous()`), machine access is explicit (`MachineTokenGuard`).

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`, ADR-0034/0035/0036, the
  new invariant in `architecture.md` and `CLAUDE.md`, invariant 1 amended; the backlog's
  auth row marked `planned (phase 6)`; new rows for deploy, GitHub sign-in, email
  sign-in. — *2026-10-03.* Docs only; `npm test` 482/482 on the same code (main after
  5.1). Invariants 1 and 9 in `architecture.md` describe the state after steps 1–2;
  until then they describe the plan.

- [x] **1 · Core: Better Auth.** `better-auth` and `@better-auth/passkey` in `core`;
  `createAuth`; the schema from Better Auth's CLI (User, Session, Account,
  Verification, Passkey) and a migration; the allowlist hook; the config type `core`
  takes (no env read in `core`, invariant 8). Tests on the real test DB: the hook
  rejects an email outside the list and lets one inside through; a user and a session
  are created through the adapter. — *2026-10-03.* 1.7.7 (latest stable; the
  NestJS package takes `>=1.5 <2`). Migration `20261003140000_better_auth`, applied
  to the test DB only — **the dev DB still needs `npm run migrate:dev`** before the
  API boots with auth (Better Auth logs "Prisma schema mismatch" otherwise).
  `better-auth` is ESM-only; `core` (CJS) loads it through Node 24's `require(esm)`.
  `npm install -w core <pkg>` crashes here (arborist `reading 'location'`): add the
  dep to the workspace's `package.json`, then a root `npm install`. Run vitest from a
  `C:\` cwd (PowerShell): from Git Bash's `/c/…` every suite fails with "failed to
  find the current suite". `core`'s test setup now deletes users too; api/mcp setups
  do not yet.

- [x] **2 · API: the guard and the machine token.** The module, CORS with credentials,
  `@AllowAnonymous()` on `/health`, `MachineTokenGuard` (`timingSafeEqual` on
  `INTAKE_TOKEN`; a route it guards accepts a session too), env validation for the new
  vars. **Check first:** the module wants `bodyParser: false`, while `setup-app.ts`
  raises the JSON limit to 5 MB for intake — that limit must survive. Every existing
  e2e test now gets a 401, so a helper signs a test user in (Better Auth's test
  utilities: 1.7 has a `testUtils` plugin in `better-auth/plugins`; else a `Session`
  row written in the test DB). New tests:
  401 without a cookie, 200 with one; `/health` anonymous; the three n8n routes 401 /
  401 / 2xx for no token, a wrong token, the right one. — *2026-10-04.*
  `@thallesp/nestjs-better-auth` 2.8.0 (ESM-only, loaded through `require(esm)` like
  `better-auth`). `CORS_ORIGINS` is gone, replaced by `WEB_ORIGIN`. **The dev API will
  not boot until `.env` has the new vars** (copy them from `.env.example`, generate
  `BETTER_AUTH_SECRET` and `INTAKE_TOKEN`; fake Google/LinkedIn ids are enough until
  step 3) and `npm run migrate:dev` has run. The `api` container now reads `.env`
  (`env_file`). Test sign-in writes the `User` + `Session` rows and signs the cookie
  itself (`apps/api/test/test-app.ts`), so no `testUtils` plugin in `createAuth`; an
  e2e app must be created with `bodyParser: false` (`createTestApp()`), or the 5 MB
  limit is lost. Only the api project was run here (63/63); core, mcp, web unchanged.

- [x] **3 · Web: sign-in.** `/login` (Google, LinkedIn, Sign in with a passkey), the
  root guard redirecting to `/login`, sign-out, Passkeys on `/profile`, `credentials`.
  MSW tests: no session → `/login`; the buttons are there. **The user first creates**
  a Google Cloud OAuth client and a LinkedIn app (it must be tied to a LinkedIn Page),
  redirect URIs `http://localhost:3000/api/auth/callback/google` and `…/linkedin`, and
  puts the credentials in `.env`. Then by hand in a browser: Google, then LinkedIn with
  the same email (one user), add a passkey, sign out, sign in with it.
  — *Code and MSW tests done 2026-10-04; by hand 2026-10-04: Google, LinkedIn and a
  passkey all sign in.* Web project 160/160, lint and typecheck clean;
  core, api, mcp not run (unchanged). Pages behind the guard now have route ids under
  `/_app` (`useSearch({ from: '/_app/vacancies' })`); `/login` and step 4's `/consent`
  sit outside it. The MSW server installs a signed-in `get-session` by default
  (`sessionHandler()`); a test of signing in overrides it. The `web` container needs its
  `node_modules` refreshed for `better-auth` + `@better-auth/passkey`. Social sign-in
  sends absolute `callbackURL` / `errorCallbackURL` on `WEB_ORIGIN`, so they pass
  Better Auth's `trustedOrigins`; a failure lands on `/login?error=…`.

- [x] **4 · The OAuth 2.1 authorization server.** `jwt` + `oauthProvider` (dynamic
  client registration on), the migration for their tables, `/consent` in the web.
  Tests: `/.well-known/oauth-authorization-server`, a client registered over DCR, the
  JWKS endpoint. — *2026-10-04.* `oauthProvider` is its own package,
  `@better-auth/oauth-provider` 1.7.7 (also in web, for `oauthProviderClient`).
  Migration `20261004120000_oauth_provider`, test DB only — **the dev DB needs
  `npm run migrate:dev`, and `.env` needs `MCP_PUBLIC_URL`** (the API reads it now;
  `http://localhost:3001/mcp` in `.env.example`, so step 5's `MCP_HTTP_PORT` is 3001).
  For step 5: issuer (`iss`) = `${BETTER_AUTH_URL}/api/auth`; metadata at the API's root,
  RFC 8414 path-inserted: `/.well-known/oauth-authorization-server/api/auth` (the
  protected-resource document's `authorization_servers` = the issuer); JWKS at
  `/api/auth/jwks` (EdDSA). `aud` = `MCP_PUBLIC_URL` only when the client sends
  `resource=<MCP_PUBLIC_URL>` on authorize and token (RFC 8707) — without it the token
  is opaque. DCR wants `application_type: 'native'` for an `http://localhost` redirect
  (the default `web` refuses it; the Inspector sends `native`). A test mints a real
  token the way `apps/api/test/oauth.e2e.spec.ts` does (register → authorize with a
  session cookie → consent with the signed query → token with PKCE); for mcp, which has
  no API in-process, signing a JWT with `jose` against a local key set is simpler.
  The `OauthResource` row is seeded at boot, insert-only: changing `MCP_PUBLIC_URL`
  adds a row, it does not edit the old one. core/api/mcp/web 501/501, lint and typecheck clean.

- [x] **5 · MCP over HTTP.** `apps/mcp/src/http.ts`, its port in `docker-compose.yml`,
  an npm script. **Check first:** how to verify `oauthProvider`'s tokens from a separate
  resource server (Better Auth's helper, or `jose` against the JWKS); how a test gets a
  valid token. Tests: the protected-resource document; 401 with `WWW-Authenticate`;
  `tools/list` with a valid token; a token with another audience refused. By hand: the
  MCP Inspector (phase 5.1) or `claude mcp add --transport http` runs the OAuth flow
  end to end. Update `architecture.md`, `contracts.md`, the root `README.md`. No skill
  changes: no tool or field changes.
  — *Code and tests done 2026-10-04; by hand 2026-10-04:* the Inspector and Claude Code
  (`claude mcp add --transport http`) both ran the OAuth flow and connected; the intake
  route gives 401 without / with a wrong token and passes the guard with `INTAKE_TOKEN`.
  stdio MCP in Claude Desktop still writes (the analyzer's latest run). The Inspector (2.x) takes the server
  on the command line — `mcp-inspector --web --transport http --server-url
  http://localhost:3001/mcp`; not `--protocol-era auto`, whose `2026-07-28` probe the
  1.x SDK refuses (shown as "Re-authentication required"). Claude Desktop cannot reach
  `localhost` over HTTP (its connectors call from Anthropic's servers): stdio stays its
  transport until the deploy row.
  Tokens are checked with `jose` (`jwtVerify` against `createRemoteJWKSet`, `typ:
  at+jwt`) inside the SDK's `requireBearerAuth`; Better Auth's resource client would
  pull `better-auth` into mcp for the same check. `src/http-app.ts` is the testable
  factory, `src/http.ts` the entrypoint. Own Express app, not the SDK's
  `createMcpExpressApp`: its JSON limit is 100 KB, too small for the batch tools. A
  service of its own in Compose, `mcp-http` (port 3001), so stdio's `mcp` is untouched;
  **the containers need `docker compose up -d --build`, then `docker compose up -d -V`**
  (new deps: `express`, `jose`; SDK 1.30 → 1.32): a recreate keeps the old anonymous
  `node_modules` volumes, so without `-V` the api fails on a missing module. Stayed on `@modelcontextprotocol/sdk` 1.x: the split v2 packages
  (`@modelcontextprotocol/server` 2.x) are a migration of every tool file, not this
  step. No CORS on the MCP server: Claude Code and the Inspector's proxy call it from
  Node, not a browser. mcp project 41/41; core, api, web not run (unchanged).

## Verification, every step

`npm run lint`, `npm run typecheck`, the full `npm test` (the real test DB, invariant 7).
After step 5, end to end: sign in with Google, then LinkedIn with the same email (one
user); add a passkey and sign in with it; `curl POST /vacancies/intake` without a token
→ 401, with `INTAKE_TOKEN` → 201; the MCP Inspector at `http://localhost:<MCP_HTTP_PORT>/mcp`
→ sign-in and consent → `tools/list`; stdio MCP in Claude Desktop works as before.
