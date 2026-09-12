# Contracts

The surfaces other code — inside this repo and outside it — depends on. Change one
of these and the "breaks if" note tells you who to update.

Source of truth:
[`apps/api/src/estimated-vacancies/estimated-vacancies.controller.ts`](../apps/api/src/estimated-vacancies/estimated-vacancies.controller.ts),
[`apps/api/src/applications/applications.controller.ts`](../apps/api/src/applications/applications.controller.ts),
[`apps/api/src/setup-app.ts`](../apps/api/src/setup-app.ts),
[`apps/mcp/src/server.ts`](../apps/mcp/src/server.ts),
[`apps/web/src/features/vacancies/types.ts`](../apps/web/src/features/vacancies/types.ts),
[`apps/web/src/features/applications/types.ts`](../apps/web/src/features/applications/types.ts).

## REST API

Base: everything under `/api/v1` except `/health` (version-neutral, un-prefixed).
Configured in `setup-app.ts` — see [ADR-0008](decisions/0008-api-prefix-and-versioning.md).
Global `ValidationPipe({ whitelist: true, transform: true })` — unknown body/query
fields are stripped; type coercion is on.

| Method + path | Body / query | Success | Errors |
| --- | --- | --- | --- |
| `GET /health` | — | `200 { status: 'ok', db: 'up' }` | `503 { status: 'error', db: 'down' }` if `SELECT 1` fails |
| `POST /api/v1/estimated-vacancies` | `SaveEstimatedVacancyDto` (below) | `201` + `Location: /api/v1/estimated-vacancies/{id}` when created; `200` when `applyUrl` already exists. Body = the full `EstimatedVacancy` (incl. `fullText`) either way. | `400` DTO validation; `422` `DomainError` (see below) |
| `GET /api/v1/estimated-vacancies` | query: `recommendation?` (enum, EN), `userAction?` (enum), `company?` (string, ILIKE contains), `limit?` (1–100, default 20 in core), `offset?` (≥0) | `200 { items: EstimatedVacancyListItem[], total: number }` — **items omit `fullText`** | `400` bad query (e.g. `limit=200`) |
| `GET /api/v1/estimated-vacancies/:id` | — | `200` full `EstimatedVacancy` (incl. `fullText`) | `404` unknown id; `400` non-integer id (`ParseIntPipe`) |
| `PATCH /api/v1/estimated-vacancies/:id/user-action` | `{ userAction: UserAction }` | `200` full `EstimatedVacancy` | `404` unknown id; `400` bad `userAction` |
| `POST /api/v1/applications` | `RecordApplicationDto`: `estimatedVacancyId` (`@IsInt @Min(1)`, **required**), `salaryInListing?`, `userComment?` (`@IsString`), `usedTailoredResume?` (`@IsBoolean`), `status?` (`@IsEnum(ApplicationStatus)`). No `appliedAt` — server uses `now()`. | **always `201`** + `Location: /api/v1/applications/{id}`. Body = `{ application: ApplicationListItem, resolution: 'linked-by-id' \| 'linked-existing' \| 'created-vacancy', vacancyCreated: boolean }`. | `400` DTO; `422` `InvalidApplicationInputError` (unknown id) / `ApplicationAlreadyExistsError` (that vacancy already has one) |
| `GET /api/v1/applications` | query: `status?` (enum), `search?` (string — vacancy `company` OR `title`, ILIKE), `limit?` (1–500, default 50 in core), `offset?` (≥0) | `200 { items: ApplicationListItem[], total: number }` — each item is the `Application` fields **flattened with** `company` / `title` / `applyUrl` / `matchScore` / `recommendation` / `estimationComment` from the linked vacancy | `400` bad query (e.g. `limit=1000`) |
| `GET /api/v1/applications/:id` | — | `200` `ApplicationListItem` | `404` unknown id; `400` non-integer id |
| `PATCH /api/v1/applications/:id/status` | `{ status: ApplicationStatus, statusComment?: string }` — `statusComment` is **appended** to the existing value joined by `" / "`, never overwritten | `200` `ApplicationListItem` | `404` unknown id; `400` bad `status` |

The API exposes only `POST`'s by-id path; the by-`(company, title)` find-or-create
path is MCP / import only. `resolution` rides in the JSON envelope (not a header) —
the web needs it. See [ADR-0017](decisions/0017-application-1to1-delta.md) /
[ADR-0019](decisions/0019-record-or-create-vacancy.md).

**`SaveEstimatedVacancyDto`** — `company`, `title`, `applyUrl`, `fullText`,
`estimationComment`: `@IsString @IsNotEmpty` (note: `applyUrl` is *not*
URL-validated at the API layer, only by the MCP zod schema); `matchScore`:
`@IsInt @Min(0) @Max(100)`; `recommendation`: `@IsIn(RECOMMENDATION_INPUT_VALUES)`
(EN + Ukrainian, normalized in `save()`).

**Error body** — `DomainExceptionFilter` (422): `{ statusCode: 422, error:
"<ErrorName>", message }`. Nest defaults for 400/404: `{ statusCode, message,
error }`. The 422 path is currently unreachable over HTTP (the DTO's `@IsIn`
rejects a bad recommendation first with a 400); the filter is defence-in-depth for
any future `DomainError` that isn't pre-validated —
[ADR-0009](decisions/0009-domain-errors-and-configure-app.md).

**CORS** — `app.enableCors({ origin: <CORS_ORIGINS split on ','> })`. Empty
`CORS_ORIGINS` → reflect any origin (dev). Set it before deploying.

> **What this constrains — breaks if you change it**
> - Renaming a path / changing the prefix or version → `apps/web/src/lib/api.ts`
>   (`API_BASE`), both features' `api.ts`, the MSW handlers in
>   `apps/web/src/test/msw/handlers.ts`, and the e2e URLs in
>   `apps/api/test/{estimated-vacancies,applications}.e2e.spec.ts`.
> - Changing `POST /applications`' envelope (`{ application, resolution, vacancyCreated }`)
>   → `recordApplicationResponseSchema` in
>   `apps/web/src/features/applications/types.ts`, `useVacancies.ts`'s `applyMutation`,
>   and `applications.e2e.spec.ts`.
> - Changing a status code (e.g. POST back to always-201) → the e2e assertions and
>   [ADR-0005](decisions/0005-analyze-once.md).
> - Adding a field to the list-item shape → `EstimatedVacancyListItem` +
>   `LIST_SELECT` in `packages/core`, **and** `estimatedVacancyListItemSchema` in
>   the web contract (they are maintained by hand in parallel —
>   [ADR-0012](decisions/0012-web-hand-written-contract.md)).
> - Moving `/health` under the version prefix → the `docker-compose.yml` `api`
>   healthcheck (`wget http://localhost:3000/health`) and any external probe.

## MCP tools

Seven tools, registered in `createServer()`. All inputs are `zod` schemas; all
success outputs are `JSON.stringify(result, null, 2)` as a single text block.

| Tool | Input | Output | Not-found / error |
| --- | --- | --- | --- |
| `save_estimated_vacancy` | `company, title, applyUrl` (`.url()`), `fullText`, `matchScore` (int 0–100), `recommendation` (EN + UA), `estimationComment` | `{ created: boolean, vacancy }` | `DomainError` → `{ isError: true, content: [message] }` |
| `get_estimated_vacancy` | `{ id: int }` | the full `EstimatedVacancy` | unknown id → `{ isError: true, content: ["EstimatedVacancy <id> not found"] }` |
| `list_estimated_vacancies` | `recommendation?` (EN only), `userAction?`, `company?`, `title?` (both ILIKE `%term%`, case-insensitive), `limit?` (1–100), `offset?` (≥0) | `{ items, total }` — no `fullText` | — |
| `update_estimated_vacancy_user_action` | `{ id: int, userAction }` | the full `EstimatedVacancy` | unknown id → `isError` result |
| `record_application` | `company`, `title` (required), `applyUrl?` (`.url()`), `matchScore?` (int 0–100), `estimationComment?`, `salaryInListing?`, `usedTailoredResume?`, `userComment?`, `status?` | `{ application, resolution, vacancyCreated }` — find-or-creates the vacancy, marks it APPLIED | `DomainError` (blank input / ambiguous match / already recorded) → `{ isError: true, content: [message] }` |
| `list_applications` | `status?`, `search?`, `limit?` (1–500), `offset?` (≥0) | `{ items: ApplicationListItem[], total }` (flattened join) | — |
| `update_application_status` | `{ id?: int, company?: string, title?: string, status, statusComment?: string }` — exactly one of `id` or `(company, title)` (case-insensitive match against the linked vacancy); `statusComment` appended to the existing value joined by `" / "`, never overwritten | `ApplicationListItem` | neither/both id-vs-company+title given, unknown id, unmatched `(company, title)`, or a matched vacancy with no recorded application → `isError` "not found"; 2+ vacancies matching `(company, title)` → `isError` listing candidate ids |
| `find_by_company` | `{ company: string, limit?: int (1–50) }` | `{ vacancies: ListEstimatedVacanciesResult, applications: ListApplicationsResult }` — an existence check across both tables in one call: `vacancies` matches `EstimatedVacancy.company`; `applications` reuses `list_applications`'s `search` (company OR the linked vacancy's title) | — |
| `find_by_title` | `{ title: string, limit?: int (1–50) }` | same shape as `find_by_company`, matched on `EstimatedVacancy.title` instead (the `applications` side still matches company OR title, same as above) | — |

`stdout` is reserved for the MCP protocol — all logging goes to `stderr`
(`console.error` in `apps/mcp/src/index.ts`).

> **What this constrains — breaks if you change it**
> - Changing `save_estimated_vacancy`'s output shape → the analyzer prompt that
>   reads `created`, and `apps/mcp/src/server.spec.ts` (which destructures
>   `{ created, vacancy }`).
> - Adding a tool / changing an input schema → `apps/mcp/src/server.spec.ts`
>   (the in-memory `Client` calls each tool by name).
> - Writing anything to `stdout` from the MCP process → corrupts the protocol
>   stream; the client disconnects.

## Web ↔ API contract

`apps/web/src/features/vacancies/types.ts` and
`apps/web/src/features/applications/types.ts` hold `zod` schemas that mirror the API
JSON. **The types are inferred from the schemas** (`z.infer`), and each feature's
`api.ts` parses every response through them via `parseResponse()` (shared from
`apps/web/src/lib/api.ts`) — a shape mismatch throws a short "unexpected format"
message (logged in full to the console), not a raw `ZodError`. Dates cross the wire
as strings.

`API_BASE = ${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/v1`
(in `src/lib/api.ts`).

These files are deliberately **not** generated from `core` and do **not** import it
— [ADR-0012](decisions/0012-web-hand-written-contract.md). It is the one place the
parallel maintenance is accepted. Note `features/applications/types.ts` carries a
third hand-written copy of the `recommendation` enum (the analyzer verdict shown in
the tracker's Score/Comment columns).

> **Breaks if you change it:** the API changes shape but this schema doesn't →
> `parseResponse` throws and the dashboard shows "the server returned data in an
> unexpected format" instead of silently rendering `undefined`. That's the
> intended failure mode — fix the schema.
