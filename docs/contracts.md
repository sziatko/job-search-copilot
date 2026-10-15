# Contracts

The surfaces other code depends on, inside this repo and outside it. Each section ends
with who breaks if it changes.

The field-level detail lives in one place each, not here:

- **REST** — Swagger UI at `/api/docs`, the OpenAPI document at `/api/docs-json`
  (requests only; built from the DTOs' `class-validator` decorators and the
  controllers' JSDoc by the `@nestjs/swagger` CLI plugin, so present under `nest build`
  / `nest start`, not under vitest). Source: `apps/api/src/*/dto/`, the controllers.
- **MCP** — each tool's description and `.describe()`d fields, in
  `apps/mcp/src/*/*.tools.ts` and `*.schemas.ts`. `npm run mcp:inspect` shows them as
  a client sees them.
- **Web** — the zod schemas in `apps/web/src/pages/*/types.ts`.

## REST API

Everything is under `/api/v1` except `/health` ([ADR-0008](decisions/0008-api-prefix-and-versioning.md)).
`ValidationPipe({ whitelist: true, transform: true })` strips unknown fields and
coerces types. JSON bodies up to 5 MB (intake carries posting text).

**Auth** ([ADR-0034](decisions/0034-auth-better-auth-in-core.md)). Every route wants a
session cookie, else `401`; Better Auth serves `/api/auth/*`. `/health` is anonymous.
The three n8n routes — `POST /vacancies/intake`, `POST /vacancies/analysis`,
`POST /vacancies/:id/analysis` — also take `Authorization: Bearer jsc_…`, an API key
from `/profile` ([ADR-0039](decisions/0039-api-keys-per-user.md)); on any other route a
key is a `401`. Swagger is outside Nest's router, so the guard does not cover it.

**One user per request** ([ADR-0038](decisions/0038-multi-user-shared-schema.md)) — the
session's, or the key's owner. Another user's id answers `404`, as an unknown one.

**Lists** ([ADR-0030](decisions/0030-cursor-paging.md)) take `cursor` (the last row's
`id`) or `offset`, not both (`400`), and answer `{ items, total, nextCursor }`. `total`
is the count matching the filter, not the page size.

| Route | Does | Success |
| --- | --- | --- |
| `GET /health` | DB ping | `200 { status: 'ok', db: 'up' }`, else `503` |
| `POST /vacancies` | Save an analysed vacancy | `201` + `Location` when created; `200` when the `applyUrl` exists — the analysis attached if the row had none, else untouched ([ADR-0005](decisions/0005-analyze-once.md)) |
| `POST /vacancies/intake` | Take postings in, unanalysed (1–100) | `200 { new: string[] }` — the urls created, as sent; one transaction |
| `POST /vacancies/:id/analysis` | Analyse a vacancy that has none | `200` the vacancy; from `NEW` the status moves by the rule |
| `POST /vacancies/analysis` | The same for 1–10, one transaction | `200` the vacancies, in input order |
| `GET /vacancies` | List: filters `recommendation`, `status` (a list), `company`, `search` (company or title), `sameCompanyAs`, `hasText`; `sort` `newest` \| `recommended` | items without `fullText`, with `companyMatchCount`, `hasAnalysis`, `hasText` |
| `GET /vacancies/:id` | One vacancy | with `comments`, `estimationComment`, `timeline` |
| `PATCH /vacancies/:id/status` | Move to any status, an optional `USER` comment | `200` as `GET /:id` |
| `POST /applications` | Record an application on a vacancy by id | `201 { application, resolution, vacancyCreated }` |
| `GET /applications` | The pipeline: `status`, `state` (`active` \| `timedOut`), `search`, `sameCompanyAs` | items with `appliedAt`, `timedOut`, `comments`, `companyMatchCount` |
| `GET /applications/:id` | One application | `404` if not in the pipeline |
| `PATCH /applications/:id/status` | Move to any status, an optional `USER` comment | the application |
| `PATCH /applications/:id` | Edit salary / CV, append a `USER` comment | the application |
| `GET /stats` | The dashboard's counts ([ADR-0031](decisions/0031-stats-endpoint.md)) | `{ logged, awaitingAnalysis, awaitingTriage, recommended, notRecommended, applied, declined, unavailable, responded, interview, actionNeeded, pipeline: { byStatus, active, timedOut, total }, recent }` |

**Errors.** A `DomainError` is `{ statusCode, error: "<ErrorName>", message }`, `422`
unless `STATUS_OF` in `domain-exception.filter.ts` says otherwise:
`AlreadyAnalysedError` → `409`, `VacancyNotFoundError` → `404`. The common ones:
`SameStatusError` (a triage status the vacancy already has), `AnalysedNotNewError`
(`NEW` on an analysed vacancy), `AlreadyAppliedError` (already in the pipeline). A
query that finds nothing (`getById`) answers `null` and the controller sends Nest's
`404`; a command throws `VacancyNotFoundError`
([ADR-0009](decisions/0009-domain-errors-and-configure-app.md)).

**CORS** — one exact origin, `WEB_ORIGIN`, with credentials; it is also Better Auth's
`trustedOrigins`.

> **What this constrains — breaks if you change it**
> - `POST /vacancies/intake`'s body or result, or the `Bearer jsc_…` header → the n8n
>   workflows (outside the repo) and `apps/api/test/vacancies.e2e.spec.ts`.
> - A path, the prefix or the version → `apps/web/src/lib/api.ts` (`API_BASE`), the
>   features' `api.ts`, the MSW handlers, the api e2e specs.
> - `POST /applications`' envelope → `recordApplicationResponseSchema` in
>   `apps/web/src/pages/applications/types.ts`, `useVacancies.ts`.
> - A status code → the api e2e assertions, [ADR-0005](decisions/0005-analyze-once.md).
> - A list-item field → the core type and select, **and** the web schema, by hand
>   ([ADR-0012](decisions/0012-web-hand-written-contract.md)). The field reaches MCP
>   too. A *derived* field (`companyMatchCount`, `hasAnalysis`, `hasText`) is
>   `.optional()` on the web, because the same schema parses the `PATCH …/status`
>   response, which carries none; the MSW fake derives them as core does.
> - `/health`'s path → the `api` healthcheck in `docker-compose.yml`.
> - What `total` means → every table's count and the MCP list tools.
> - A field the DTO does not declare is stripped (`whitelist`): a new query param needs
>   its DTO field, or it is silently ignored.

## MCP tools

Fifteen tools in `createServer()` ([ADR-0010](decisions/0010-mcp-server-factory.md));
each feature owns its `*.tools.ts` and `*.schemas.ts`. Inputs are zod schemas; outputs
are `JSON.stringify(result, null, 2)` in one text block; a `DomainError` is
`{ isError: true }` with its message. The write tools answer with a short confirmation
— `success` and the row's `id`, `company`, `title`; intake's `{ new }` — never the
text just sent.

| Group | Tools |
| --- | --- |
| Save analysed | `save_vacancy`, `save_vacancies_batch` (not transactional) |
| Intake | `intake_vacancy`, `intake_vacancies_batch` (no posting text over MCP) |
| The analysis queue | `list_vacancies` (`status: ['NEW'], hasText: true`) → `get_vacancies_batch` (1–10) → `submit_analysis` / `submit_analyses_batch` (1–10, one transaction) |
| Read | `get_vacancy`, `list_vacancies`, `list_applications` (`offset` paging only) |
| Applications | `record_application`, `record_applications_batch` (one transaction), `update_application`, `update_vacancy_status`, `add_comment` |

Rules that span tools go to the client as the server's `instructions`
(`SERVER_INSTRUCTIONS` in [`server.ts`](../apps/mcp/src/server.ts)). Claude Desktop
drops them, so each is said in a tool description too: the descriptions are the copy
every client shows.

`stdout` is the protocol over stdio: logging goes to `stderr`.

**Over HTTP** ([ADR-0035](decisions/0035-mcp-over-http-oauth-resource-server.md)) —
`apps/mcp/src/http.ts` serves the same tools as Streamable HTTP at `MCP_PUBLIC_URL`
(`/mcp`, port 3001). Stdio acts as the owner of `JSC_API_KEY`, checked at boot.

- `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728) names the API as the
  authorization server (`${BETTER_AUTH_URL}/api/auth`).
- `POST /mcp` wants `Authorization: Bearer …`: an API key (`jsc_…`, checked in the DB),
  or a JWT from the API's `oauthProvider` (`typ: at+jwt`, checked against the API's
  JWKS for `iss`, `aud` ∋ `MCP_PUBLIC_URL`, `exp`). A client gets a JWT only when it
  sends `resource=<MCP_PUBLIC_URL>` (RFC 8707). A bad or missing token → `401` with
  `WWW-Authenticate … resource_metadata`; the API unreachable → `500`.
- Stateless: a server per `POST`, no session id; `GET` / `DELETE /mcp` → `405`. Bodies
  up to 5 MB. The `Host` header must be `MCP_PUBLIC_URL`'s host, else `403`.

> **What this constrains — breaks if you change it**
> - A tool's name, input or output → the owner's skills (outside the repo, re-uploaded
>   by hand) and `apps/mcp/src/server.spec.ts`.
> - Anything written to `stdout` by the stdio process → the protocol stream breaks and
>   the client disconnects.
> - `MCP_PUBLIC_URL` without the API seeing the same value → every token's `aud` misses,
>   every call is a `401`. The API seeds an `OauthResource` row per value, insert-only.

## Web ↔ API contract

`apps/web/src/pages/*/types.ts` hold zod schemas of the API's JSON; the types are
`z.infer`red from them, and every response goes through `parseResponse()`
(`apps/web/src/lib/api.ts`). A mismatch throws a short "unexpected format" message,
logged in full to the console. Dates cross as strings.
`API_BASE = ${VITE_API_URL ?? 'http://localhost:3000'}/api/v1`.

The schemas are written by hand, never imported from `core`
([ADR-0012](decisions/0012-web-hand-written-contract.md)).
`apps/api/test/contract.e2e.spec.ts` parses the real API's responses with them, so a
drift fails a test.

> **Breaks if you change it:** the API changes shape and the schema does not → the
> contract test fails, and in the app `parseResponse` shows "unexpected format"
> instead of rendering `undefined`. Fix the schema.
