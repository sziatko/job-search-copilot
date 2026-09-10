# Contracts

The surfaces other code — inside this repo and outside it — depends on. Change one
of these and the "breaks if" note tells you who to update.

Source of truth:
[`apps/api/src/estimated-vacancies/estimated-vacancies.controller.ts`](../apps/api/src/estimated-vacancies/estimated-vacancies.controller.ts),
[`apps/api/src/setup-app.ts`](../apps/api/src/setup-app.ts),
[`apps/mcp/src/server.ts`](../apps/mcp/src/server.ts),
[`apps/web/src/features/vacancies/types.ts`](../apps/web/src/features/vacancies/types.ts).

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
> - Renaming a path / changing the prefix or version → `apps/web/src/features/vacancies/api.ts`
>   (`API_BASE`), the MSW handlers in `apps/web/src/test/msw/handlers.ts`, and the
>   URLs in `apps/api/test/estimated-vacancies.e2e.spec.ts`.
> - Changing a status code (e.g. POST back to always-201) → the e2e assertions and
>   [ADR-0005](decisions/0005-analyze-once.md).
> - Adding a field to the list-item shape → `EstimatedVacancyListItem` +
>   `LIST_SELECT` in `packages/core`, **and** `estimatedVacancyListItemSchema` in
>   the web contract (they are maintained by hand in parallel —
>   [ADR-0012](decisions/0012-web-hand-written-contract.md)).
> - Moving `/health` under the version prefix → the `docker-compose.yml` `api`
>   healthcheck (`wget http://localhost:3000/health`) and any external probe.

## MCP tools

Four tools, registered in `createServer()`. All inputs are `zod` schemas; all
success outputs are `JSON.stringify(result, null, 2)` as a single text block.

| Tool | Input | Output | Not-found / error |
| --- | --- | --- | --- |
| `save_estimated_vacancy` | `company, title, applyUrl` (`.url()`), `fullText`, `matchScore` (int 0–100), `recommendation` (EN + UA), `estimationComment` | `{ created: boolean, vacancy }` | `DomainError` → `{ isError: true, content: [message] }` |
| `get_estimated_vacancy` | `{ id: int }` | the full `EstimatedVacancy` | unknown id → `{ isError: true, content: ["EstimatedVacancy <id> not found"] }` |
| `list_estimated_vacancies` | `recommendation?` (EN only), `userAction?`, `company?`, `limit?` (1–100), `offset?` (≥0) | `{ items, total }` — no `fullText` | — |
| `update_estimated_vacancy_user_action` | `{ id: int, userAction }` | the full `EstimatedVacancy` | unknown id → `isError` result |

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

`apps/web/src/features/vacancies/types.ts` holds `zod` schemas that mirror the API
JSON. **The types are inferred from the schemas** (`z.infer`), and
`apps/web/src/features/vacancies/api.ts` parses every response through them via
`parseResponse()` — a shape mismatch throws a short "unexpected format" message
(logged in full to the console), not a raw `ZodError`. Dates cross the wire as
strings.

`API_BASE = ${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/v1`.

This file is deliberately **not** generated from `core` and does **not** import it
— [ADR-0012](decisions/0012-web-hand-written-contract.md). It is the one place the
parallel maintenance is accepted.

> **Breaks if you change it:** the API changes shape but this schema doesn't →
> `parseResponse` throws and the dashboard shows "the server returned data in an
> unexpected format" instead of silently rendering `undefined`. That's the
> intended failure mode — fix the schema.
