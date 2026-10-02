# Contracts

The surfaces other code — inside this repo and outside it — depends on. Change one
of these and the "breaks if" note tells you who to update.

Source of truth:
[`apps/api/src/vacancies/vacancies.controller.ts`](../apps/api/src/vacancies/vacancies.controller.ts),
[`apps/api/src/applications/applications.controller.ts`](../apps/api/src/applications/applications.controller.ts),
[`apps/api/src/log/log.controller.ts`](../apps/api/src/log/log.controller.ts),
[`apps/api/src/setup-app.ts`](../apps/api/src/setup-app.ts),
[`apps/mcp/src/vacancies/vacancies.tools.ts`](../apps/mcp/src/vacancies/vacancies.tools.ts),
[`apps/mcp/src/applications/applications.tools.ts`](../apps/mcp/src/applications/applications.tools.ts),
[`apps/mcp/src/vacancy-log/vacancy-log.tools.ts`](../apps/mcp/src/vacancy-log/vacancy-log.tools.ts),
[`apps/web/src/pages/vacancies/types.ts`](../apps/web/src/pages/vacancies/types.ts),
[`apps/web/src/pages/applications/types.ts`](../apps/web/src/pages/applications/types.ts),
[`apps/web/src/pages/log/types.ts`](../apps/web/src/pages/log/types.ts).

## REST API

Base: everything under `/api/v1` except `/health` (version-neutral, un-prefixed).
Configured in `setup-app.ts` — see [ADR-0008](decisions/0008-api-prefix-and-versioning.md).
Global `ValidationPipe({ whitelist: true, transform: true })` — unknown body/query
fields are stripped; type coercion is on.

Text marked **(phase 4 step N)** is agreed but not built yet
([`phases/phase-4.md`](phases/phase-4.md)); the step that builds it removes the mark.

**Cursor paging** ([ADR-0030](decisions/0030-cursor-paging.md)) — the list endpoints
the web scrolls take `cursor?` (int, the `id` of the last row the client has) beside
`offset?`, and answer `{ items, total, nextCursor: number | null }` — `nextCursor` is
the last item's `id` when more rows follow. `cursor` and `offset` together → `400`.
`total` stays the count matching the filter. MCP's list tools keep `offset` only.

| Method + path | Body / query | Success | Errors |
| --- | --- | --- | --- |
| `GET /health` | — | `200 { status: 'ok', db: 'up' }` | `503 { status: 'error', db: 'down' }` if `SELECT 1` fails |
| `POST /api/v1/vacancies` | `SaveVacancyDto` (below) | `201` + `Location: /api/v1/vacancies/{id}` when created; `200` when `applyUrl` already exists. Body = the full `Vacancy` row (incl. `fullText`) either way — without `estimationComment`, which is a `Comment` row now; `GET /:id` returns it. | `400` DTO validation; `422` `DomainError` (see below) |
| `GET /api/v1/vacancies` | query: `recommendation?` (enum, EN), `status?` (`A,B` — any of them, each `@IsEnum(VacancyStatus)`), `company?` (string, ILIKE contains — `%`/`_`/`\` are literal), `sameCompanyAs?` (string — every spelling of the name's company: an equal `companyKey`, [ADR-0032](decisions/0032-same-company-normalised-name.md); ANDs with the rest), `search?` (string — `company` **OR** `title`, ILIKE, same escaping), `limit?` (1–100, default 20 in core), `offset?` (≥0), `cursor?` (int ≥1); `sort?` — `newest` (default, `createdAt desc, id desc`) or `recommended` (`recommendation asc, matchScore desc, id desc`) | `200 { items: VacancyListItem[], total: number }` — **items omit `fullText`** and carry the derived `companyMatchCount` and `hasAnalysis`; plus `nextCursor` | `400` bad query (e.g. `limit=200`, `sort=oldest`); `cursor` with `offset` |
| `GET /api/v1/vacancies/:id` | — | `200` full `Vacancy` (incl. `fullText`, `status`, `statusChangedAt`, salary / CV) plus `comments` (every one, oldest first) and `estimationComment: string \| null`, the first `ANALYZER` comment, plus `timeline: { status, createdAt }[]` from `StatusChange`, oldest first | `404` unknown id; `400` non-integer id (`ParseIntPipe`) |
| `PATCH /api/v1/vacancies/:id/status` | `{ status: VacancyStatus }` — any status; every call is journaled and moves `statusChangedAt`, a repeated pipeline status included | `200` as `GET /:id` — the web parses it with its list-item schema | `404` unknown id; `400` bad `status`; `422` `SameStatusError` — a triage status the vacancy already has (nothing written) |
| `POST /api/v1/applications` | `RecordApplicationDto`: `vacancyId` (`@IsInt @Min(1)`, **required**), `salaryInListing?`, `comment?` (`@IsString`; added as a `USER` comment), `usedTailoredResume?` (`@IsBoolean`), `status?` (`@IsIn(PIPELINE_STATUSES)` — recorded further along; `APPLIED` is journaled first). No `appliedAt` — server uses `now()`. | **always `201`** + `Location: /api/v1/applications/{id}` — the vacancy's id. Body = `{ application: ApplicationListItem, resolution: 'linked-by-id' \| 'linked-existing' \| 'created-vacancy', vacancyCreated: boolean }`. | `400` DTO; `422` `InvalidApplicationInputError` (unknown id) / `AlreadyAppliedError` (that vacancy is already in the pipeline) |
| `GET /api/v1/applications` | query: `status?` (one pipeline status, `@IsIn(PIPELINE_STATUSES)`), `state?` (`active` \| `timedOut` — the derived split, the rule of [ADR-0031](decisions/0031-stats-endpoint.md); ANDs with `status`, neither = all), `search?` (string — `company` OR `title`, ILIKE), `sameCompanyAs?` (as on `GET /vacancies`), `limit?` (1–500, default 50 in core), `offset?` (≥0), `cursor?` (int ≥1) | `200 { items: ApplicationListItem[], total: number, nextCursor }` — the vacancies in the pipeline, `statusChangedAt desc, id desc`. Each item: `id` (the vacancy's), `status`, `statusChangedAt`, `timedOut` (the timeout rule, as of the read), `appliedAt` (the latest `APPLIED` journal row; `null` if none), `salaryInListing`, `usedTailoredResume`, `company` / `title` / `applyUrl` / `matchScore` / `recommendation`, and `comments: { id, createdAt, body, source }[]`, oldest first, the `ANALYZER` one included, plus the derived `companyMatchCount` (every vacancy, any status, of the same company — an equal `companyKey`, [ADR-0032](decisions/0032-same-company-normalised-name.md) — the same count as `GET /vacancies`'; the list only, not the single-row responses). Every `ApplicationListItem` response (`GET /:id`, both `PATCH`es, `POST`'s `application`) carries `timedOut` too | `400` bad query (e.g. `limit=1000`, a triage `status`, `state=TIMEOUT`); `cursor` with `offset` |
| `GET /api/v1/applications/:id` | — | `200` `ApplicationListItem` | `404` unknown id or not in the pipeline; `400` non-integer id |
| `PATCH /api/v1/applications/:id/status` | `{ status: VacancyStatus, comment?: string }` — any status (the UI offers the pipeline); every call is journaled and moves `statusChangedAt`, a repeated pipeline status included. A non-blank `comment` becomes a new dated `USER` row in `comments` (append-only) | `200` `ApplicationListItem` | `404` unknown id; `400` bad `status`; `422` `SameStatusError` — a triage status the vacancy already has (nothing written) |
| `PATCH /api/v1/applications/:id` | `UpdateApplicationDto`: `salaryInListing?` (`@IsString`, `null` or blank clears), `usedTailoredResume?` (`@IsBoolean`), `comment?` (`@IsString`; a non-blank one is added as a `USER` comment, it edits none) — a field left out is untouched; anything else (e.g. `status`) is stripped | `200` `ApplicationListItem` | `404` unknown id; `400` DTO |
| `POST /api/v1/log/check` | `CheckLogDto`: `{ entries: LogEntryDto[] }` (1–100, `@ValidateNested`), each `url?` / `company?` / `title?` (`@IsString`, raw — normalized in core) | **`200`** `{ new: string[] }` — the url of each new entry **exactly as sent**; those are now recorded, every other entry was a duplicate. An entry without an http(s) url is skipped ([ADR-0026](decisions/0026-vacancy-log-table.md)) | `400` DTO (empty / oversized / non-string) |
| `GET /api/v1/log` | `ListLogQueryDto`: `q?` (string — `company` OR `title` OR `url`, ILIKE, `%`/`_`/`\` literal), `cursor?` (int ≥1), `limit?` (1–100, default 50 in core). No `offset` | `200 { items: { id, createdAt, url, company, title }[], total, nextCursor }` — `createdAt desc, id desc` | `400` bad query (e.g. `limit=101`, `cursor=abc`) |
| `GET /api/v1/stats` | — | `200 { logged, awaitingTriage, recommended, applied, declined, unavailable, responded, interview, recruiterScreen, pipeline: { byStatus, active, timedOut, total }, recent }` — `applied` / `responded` / `interview` count the `StatusChange` journal ("ever reached"); `declined`, `unavailable`, `recruiterScreen` and `pipeline` the current status; each field is defined in [ADR-0031](decisions/0031-stats-endpoint.md). `byStatus` has every pipeline status as a key (0 when none); `recent` is the 6 latest **pipeline** `StatusChange` rows (triage moves left out), `createdAt desc, id desc`, each `{ id, vacancyId, status, createdAt, company, title }` | — |

The API exposes only `POST`'s by-id path; the by-`(company, title)` find-or-create
path is MCP only. `resolution` rides in the JSON envelope (not a header); the web
parses only `application`. See [ADR-0029](decisions/0029-one-vacancy-table.md) /
[ADR-0019](decisions/0019-record-or-create-vacancy.md).

The vacancies list's filter vocabulary differs by transport: `core`'s `list()`
accepts `company` and `title` independently (both ILIKE), MCP exposes both, and
HTTP exposes `company` plus the broader `search` (`company` OR `title`). A caller
wanting a title-only filter over HTTP needs a `title?` field on the DTO — and
`whitelist: true` strips anything the DTO doesn't declare, so adding the param
without the field is silently a no-op.

**`SaveVacancyDto`** — `company`, `title`, `applyUrl`, `fullText`,
`estimationComment` (stored as the vacancy's `ANALYZER` comment): `@IsString @IsNotEmpty` (note: `applyUrl` is *not*
URL-validated at the API layer — `@IsString` is the whole check. Validation and
canonicalization both happen in `core`, so no transport can skip them: the MCP
zod schema's `z.url()` is a convenience, not the guard); `matchScore`:
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
> - Changing `POST /log/check`'s body or result → any n8n workflow calling
>   it (not in this repo; this is n8n's only way in while MCP is stdio-only) and
>   `apps/api/test/log.e2e.spec.ts`.
> - Renaming a path / changing the prefix or version → `apps/web/src/lib/api.ts`
>   (`API_BASE`), both features' `api.ts`, the MSW handlers in
>   `apps/web/src/test/msw/handlers.ts`, and the e2e URLs in
>   `apps/api/test/{vacancies,applications}.e2e.spec.ts`.
> - Changing `POST /applications`' envelope (`{ application, resolution, vacancyCreated }`)
>   → `recordApplicationResponseSchema` in
>   `apps/web/src/pages/applications/types.ts`, `useVacancies.ts`'s `applyMutation`,
>   and `applications.e2e.spec.ts`.
> - Changing a status code (e.g. POST back to always-201) → the e2e assertions and
>   [ADR-0005](decisions/0005-analyze-once.md).
> - Adding a field to the list-item shape → `VacancyListItem` +
>   `LIST_SELECT` in `packages/core`, **and** `vacancyListItemSchema` in
>   the web contract (they are maintained by hand in parallel —
>   [ADR-0012](decisions/0012-web-hand-written-contract.md)). Two traps: the field
>   reaches **both** transports, because `list()` feeds `apps/api` and `apps/mcp`
>   alike; and a field that is *derived* rather than a column must be `.optional()`
>   in the web schema, because that same schema parses the
>   `PATCH .../status` response, which carries no derived fields
>   ([ADR-0025](decisions/0025-vacancies-list-search-server-side.md)). Both derived
>   fields so far — `companyMatchCount`, `hasAnalysis` — go through one private
>   `withDerivedFields` in `vacancy.service.ts` (the count through the module-level
>   `companyMatchCounts`, which `ApplicationService.list` calls too; it counts by `companyKey`, [ADR-0032](decisions/0032-same-company-normalised-name.md) — so
>   `applicationListItemSchema` has it `.optional()` for the same reason); the MSW fake in
>   `apps/web/src/test/msw/handlers.ts` derives them the same way, so a fixture
>   cannot hand-set a value the endpoint would not produce.
> - Moving `/health` under the version prefix → the `docker-compose.yml` `api`
>   healthcheck (`wget http://localhost:3000/health`) and any external probe.
> - Changing what `total` means in a list response — it is the number of rows
>   **matching the filter**, not the size of the page returned. The scrolling tables'
>   footers read it ([ADR-0030](decisions/0030-cursor-paging.md)), and MCP's
>   `list_*` tools report it; making it the page size would misreport every footer
>   silently rather than error. The dashboard counts through `GET /stats`
>   ([ADR-0031](decisions/0031-stats-endpoint.md)), not through list totals.

## MCP tools

Ten tools, registered in `createServer()` — each domain owns its own
`<feature>/*.tools.ts` + `*.schemas.ts`, and `server.ts` stays composition-only
([ADR-0010](decisions/0010-mcp-server-factory.md)). All inputs are `zod` schemas; all
success outputs are `JSON.stringify(result, null, 2)` as a single text block. The rules
that span tools (the order of the workflow, the status model, what `id` means) go to the
client on connect as the server's `instructions` (`SERVER_INSTRUCTIONS` in
[`server.ts`](../apps/mcp/src/server.ts)); a tool's own rules are in its description and
field `.describe()`s. Claude Desktop drops `instructions` (the server does send them), so
each of those rules is also said in a tool description — descriptions are the copy every
client shows. The
record/save/update tools return only a minimal confirmation (see Output column) — they never echo
back the large text the caller just sent (`fullText`, `estimationComment`,
`comment`); read the full record back with `get_vacancy`
/ `list_vacancies` / `list_applications`.

| Tool | Input | Output | Not-found / error |
| --- | --- | --- | --- |
| `save_vacancy` | `company, title, applyUrl` (`.url()`), `fullText`, `matchScore` (int 0–100), `recommendation` (EN + UA), `estimationComment` | `{ success: boolean, vacancy: { id, company, title } }` — `success` is `false` when an existing `applyUrl` caused the analysis to be dropped | `DomainError` → `{ isError: true, content: [message] }` |
| `save_vacancies_batch` | `{ vacancies: [...] }` — array (1–100) of the same shape as `save_vacancy`'s input | `[{ success, vacancy: { id, company, title } }, ...]`, one entry per input, same order and same per-item shape as `save_vacancy` — not transactional, so one item's dedup/skip doesn't affect the others | array size outside 1–100 → schema-validation error; `DomainError` → `{ isError: true, content: [message] }` |
| `get_vacancy` | `{ id: int }` | the full `Vacancy`, with `status`, `comments`, `estimationComment` and `timeline` | unknown id → `{ isError: true, content: ["Vacancy <id> not found"] }` |
| `list_vacancies` | `recommendation?` (EN only), `status?` (an array — any of them), `applyUrl?` (exact after normalization), `company?`, `title?` (both ILIKE `%term%`, case-insensitive), `limit?` (1–100), `offset?` (≥0) | `{ items, total }` — no `fullText`; each item also carries `companyMatchCount` (derived, see the list-item note under the REST table) | — |
| `record_application` | `vacancyId`, or `company` + `title` — exactly one of the two, `applyUrl?` (`.url()`), `matchScore?` (int 0–100), `estimationComment?` (the `ANALYZER` comment of a vacancy it creates), `salaryInListing?`, `usedTailoredResume?`, `comment?` (a `USER` comment), `status?` | `{ success: true, application: { id, company, title } }` — `id` is the vacancy's; find-or-creates the vacancy and moves it to APPLIED (then `status?`, a pipeline stage); use `list_vacancies`/`list_applications` to see `resolution`-equivalent state | `DomainError` (blank input / ambiguous match / already in the pipeline) → `{ isError: true, content: [message] }` |
| `record_applications_batch` | `{ applications: [...] }` — array (1–100) of the same shape as `record_application`'s input | `[{ success: true, application: { id, company, title } }, ...]`, one entry per input, same order and same per-item shape as `record_application` — **transactional**: runs in one `$transaction` (`ApplicationService.recordMany`), so one failing item rolls back the whole batch | array size outside 1–100 → schema-validation error; `DomainError` on any item → `{ isError: true, content: [message] }`, nothing persisted |
| `list_applications` | `status?` (one pipeline status), `applyUrl?` (exact after normalization — an email's posting link), `search?` (company OR title), `company?`, `title?` (each independent — given with `search` and/or each other, they AND, not OR; all three ILIKE `%term%`, case-insensitive), `limit?` (1–500), `offset?` (≥0) | `{ items: ApplicationListItem[], total }` — the pipeline, last move first; `id` is the vacancy's; each item carries `timedOut` and `companyMatchCount`, as over REST | — |
| `update_vacancy_status` | `{ id?: int, company?: string, title?: string, status, comment?: string }` — any `VacancyStatus`; exactly one of `id` or `(company, title)` (case-insensitive match, among the vacancies already in the pipeline only); every pipeline call is an event, the same status included — once per real event; a triage status the vacancy already has is refused; `comment` becomes a new dated `AGENT` comment, earlier ones untouched | `{ success: true, vacancy: { id, company, title } }` — use `get_vacancy` / `list_applications` to see the resulting `status` / `comments` | neither id nor company+title given, unknown id, or unmatched `(company, title)` (a vacancy never applied to included) → `isError` "not found"; 2+ applied vacancies matching `(company, title)` → `isError` listing candidate ids; a triage repeat → `isError` "already <status>" |
| `check_vacancy_log` | `url` (required, raw string — not `.url()`, core decides what is usable), `company?`, `title?` | `{ new: boolean }` — a new posting is **recorded** by the same call ([ADR-0026](decisions/0026-vacancy-log-table.md)) | missing or non-http(s) url → `InvalidVacancyLogEntryError` → `isError` |
| `check_vacancy_log_batch` | `{ entries: [...] }` — array (1–100) of `{ url?, company?, title? }` | `{ new: string[] }` — the url of each new entry exactly as sent, recorded by this call; **transactional**, in order, so a posting twice in one call is new only once. Entries without an http(s) url are skipped | array size outside 1–100 → schema-validation error |

`stdout` is reserved for the MCP protocol — all logging goes to `stderr`
(`console.error` in `apps/mcp/src/index.ts`).

> **What this constrains — breaks if you change it**
> - Changing `save_vacancy`'s output shape → the external
>   vacancy-match-analyzer prompt (not in this repo) reads `success` (renamed from
>   `created`) — update it there if you change this again — and
>   `apps/mcp/src/server.spec.ts` (which destructures `{ success, vacancy }`).
> - Adding a tool / changing an input schema → `apps/mcp/src/server.spec.ts`
>   (the in-memory `Client` calls each tool by name).
> - Writing anything to `stdout` from the MCP process → corrupts the protocol
>   stream; the client disconnects.

## Web ↔ API contract

`apps/web/src/pages/vacancies/types.ts` and
`apps/web/src/pages/applications/types.ts` hold `zod` schemas that mirror the API
JSON. **The types are inferred from the schemas** (`z.infer`), and each feature's
`api.ts` parses every response through them via `parseResponse()` (shared from
`apps/web/src/lib/api.ts`) — a shape mismatch throws a short "unexpected format"
message (logged in full to the console), not a raw `ZodError`. Dates cross the wire
as strings.

`API_BASE = ${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/v1`
(in `src/lib/api.ts`).

These files are deliberately **not** generated from `core` and do **not** import it
— [ADR-0012](decisions/0012-web-hand-written-contract.md). It is the one place the
parallel maintenance is accepted.

> **Breaks if you change it:** the API changes shape but this schema doesn't →
> `parseResponse` throws and the dashboard shows "the server returned data in an
> unexpected format" instead of silently rendering `undefined`. That's the
> intended failure mode — fix the schema.
