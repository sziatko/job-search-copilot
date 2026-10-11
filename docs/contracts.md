# Contracts

The surfaces other code — inside this repo and outside it — depends on. Change one
of these and the "breaks if" note tells you who to update.

Source of truth:
[`apps/api/src/vacancies/vacancies.controller.ts`](../apps/api/src/vacancies/vacancies.controller.ts),
[`apps/api/src/applications/applications.controller.ts`](../apps/api/src/applications/applications.controller.ts),
[`apps/api/src/setup-app.ts`](../apps/api/src/setup-app.ts),
[`apps/mcp/src/vacancies/vacancies.tools.ts`](../apps/mcp/src/vacancies/vacancies.tools.ts),
[`apps/mcp/src/applications/applications.tools.ts`](../apps/mcp/src/applications/applications.tools.ts),
[`apps/mcp/src/intake/intake.tools.ts`](../apps/mcp/src/intake/intake.tools.ts),
[`apps/web/src/pages/vacancies/types.ts`](../apps/web/src/pages/vacancies/types.ts),
[`apps/web/src/pages/applications/types.ts`](../apps/web/src/pages/applications/types.ts),
[`apps/web/src/pages/dashboard/types.ts`](../apps/web/src/pages/dashboard/types.ts).

## REST API

Base: everything under `/api/v1` except `/health` (version-neutral, un-prefixed).
Configured in `setup-app.ts` — see [ADR-0008](decisions/0008-api-prefix-and-versioning.md).
Global `ValidationPipe({ whitelist: true, transform: true })` — unknown body/query
fields are stripped; type coercion is on. JSON bodies up to 5 MB (`AuthModule`'s
`bodyParser` in `app.module.ts`, the app created with `bodyParser: false`; Express'
default is 100 KB) — intake carries posting text.

**Auth** ([ADR-0034](decisions/0034-auth-better-auth-in-core.md)) — every route wants
a session cookie, else `401`; Better Auth serves `/api/auth/*`. Two exceptions:
`/health` is anonymous; `POST /vacancies/intake`, `POST /vacancies/analysis` and
`POST /vacancies/:id/analysis` also take `Authorization: Bearer jsc_…`, an API key
from `/profile` ([ADR-0039](decisions/0039-api-keys-per-user.md)) — n8n's credentials hold that
header, so renaming it or its scheme breaks them. Swagger (`/api/docs`) is outside
Nest's router, so the guard does not see it: it stays open.

Browse and try it: Swagger UI at `/api/docs`, the OpenAPI document at `/api/docs-json`
(`@nestjs/swagger`; requests only, responses are untyped). The request fields come
from the DTOs' `class-validator` decorators and the descriptions from the controllers'
JSDoc, through the CLI plugin in `nest-cli.json` — present in `nest build` / `nest
start`, not under vitest's SWC. Not a contract: the web's schema stays hand-written.

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
| `POST /api/v1/vacancies` | `SaveVacancyDto` (below) | `201` + `Location: /api/v1/vacancies/{id}` when created; `200` when `applyUrl` already exists — with this analysis attached (and `fullText`, when the row had none) if the row had no analysis (taken in by intake), else untouched ([ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)). Body = the full `Vacancy` row (incl. `fullText`) either way — without `estimationComment`, which is a `Comment` row now; `GET /:id` returns it. | `400` DTO validation; `422` `DomainError` (see below) |
| `POST /api/v1/vacancies/:id/analysis` | `SubmitAnalysisDto`: `matchScore` (`@IsInt @Min(0) @Max(100)`), `recommendation` (`@IsIn(RECOMMENDATION_INPUT_VALUES)`), `estimationComment` (`@IsString @IsNotEmpty`; the `ANALYZER` comment) | `200` — the full `Vacancy` row, now analysed. From `NEW` the status moves by the rule (`SKIP` → `FILTERED_OUT`, else `NOT_REVIEWED`, journaled); any other status is untouched ([ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)). For sub-project 3's n8n flow | `409` `AlreadyAnalysedError` (nothing written); `404` `VacancyNotFoundError`; `400` DTO / non-integer id |
| `POST /api/v1/vacancies/analysis` | `SubmitAnalysesDto`: `{ analyses: [{ id, matchScore, recommendation, estimationComment }] }` (1–10 — `ANALYSIS_BATCH_MAX`, `@ValidateNested`) | `200` — the `Vacancy` rows, in input order. **One transaction**: one failing item writes none of them | `409` / `404` as above, for any item (nothing written); `400` DTO (empty, more than 10) |
| `POST /api/v1/vacancies/intake` | `IntakeVacanciesDto`: `{ entries: [...] }` (1–100, `@ValidateNested`), each `url` (`@IsUrl` — http(s), scheme required), `company`, `title` (`@IsString`, not blank), `source?` (free text: `linkedin`, `justjoin`, …), `fullText?` — raw, normalized in core; under 200 characters once trimmed it counts as none (a login wall, not a posting). A session or `Bearer <API key>` (n8n) | **`200`** `{ new: string[] }` — the url of each new entry **exactly as sent**; each is now a vacancy in status `NEW`, unanalysed, with `source` and `fullText` when given. Every other entry was a duplicate (by url, else by company + title — [ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)); a duplicate without posting text gets the entry's, and nothing else. **One transaction**, in order: a posting twice in one call is new once. n8n's way in | `400` DTO (empty / more than 100 / an entry without an http(s) url, a company or a title — the whole call) |
| `GET /api/v1/vacancies` | query: `recommendation?` (enum, EN), `status?` (`A,B` — any of them, each `@IsEnum(VacancyStatus)`), `company?` (string, ILIKE contains — `%`/`_`/`\` are literal), `sameCompanyAs?` (string — every spelling of the name's company: an equal `companyKey`, [ADR-0032](decisions/0032-same-company-normalised-name.md), never `FILTERED_OUT` — the rows `companyMatchCount` counts; ANDs with the rest), `hasText?` (`true` \| `false` — with / without posting text; anything else `400`), `search?` (string — `company` **OR** `title`, ILIKE, same escaping), `limit?` (1–100, default 20 in core), `offset?` (≥0), `cursor?` (int ≥1); `sort?` — `newest` (default, `createdAt desc, id desc`) or `recommended` (`recommendation asc, matchScore desc, id desc` — the unanalysed last) | `200 { items: VacancyListItem[], total: number }` — **items omit `fullText`** and carry the derived `companyMatchCount`, `hasAnalysis` (`recommendation !== null`) and `hasText` (`fullText !== null`); `matchScore` / `recommendation` are `null` on a vacancy not analysed yet ([ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)); plus `nextCursor` | `400` bad query (e.g. `limit=200`, `sort=oldest`); `cursor` with `offset` |
| `GET /api/v1/vacancies/:id` | — | `200` full `Vacancy` (incl. `fullText` — `null` when there is no posting text — `matchScore` / `recommendation` — both `null` when not analysed — `status`, `statusChangedAt`, salary / CV, `companyKey` / `titleKey`, `source`) plus `comments` (every one, oldest first) and `estimationComment: string \| null`, the first `ANALYZER` comment, plus `timeline: { status, createdAt }[]` from `StatusChange`, oldest first | `404` unknown id; `400` non-integer id (`ParseIntPipe`) |
| `PATCH /api/v1/vacancies/:id/status` | `{ status: VacancyStatus, comment?: string }` — any status; every call is journaled and moves `statusChangedAt`, a repeated pipeline status included. A non-blank `comment` becomes a new dated `USER` row in `comments`, in the same transaction (the web sends it from Save for later's dialog) | `200` as `GET /:id` — the web parses it with its list-item schema | `404` unknown id; `400` bad `status`; `422` `SameStatusError` — a triage status the vacancy already has; `422` `AnalysedNotNewError` — `NEW` for a vacancy that has an analysis (the `Vacancy_new_is_unanalysed` CHECK, [ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)); nothing written either way |
| `POST /api/v1/applications` | `RecordApplicationDto`: `vacancyId` (`@IsInt @Min(1)`, **required**), `salaryInApplication?`, `comment?` (`@IsString`; added as a `USER` comment), `usedTailoredResume?` (`@IsBoolean`), `status?` (`@IsIn(PIPELINE_STATUSES)` — recorded further along; `APPLIED` is journaled first). No `appliedAt` — server uses `now()`. | **always `201`** + `Location: /api/v1/applications/{id}` — the vacancy's id. Body = `{ application: ApplicationListItem, resolution: 'linked-by-id' \| 'linked-existing' \| 'created-vacancy', vacancyCreated: boolean }`. | `400` DTO; `422` `InvalidApplicationInputError` (unknown id) / `AlreadyAppliedError` (that vacancy is already in the pipeline) |
| `GET /api/v1/applications` | query: `status?` (one pipeline status, `@IsIn(PIPELINE_STATUSES)`), `state?` (`active` \| `timedOut` — the derived split, the rule of [ADR-0031](decisions/0031-stats-endpoint.md); ANDs with `status`, neither = all), `search?` (string — `company` OR `title`, ILIKE), `sameCompanyAs?` (as on `GET /vacancies`), `limit?` (1–500, default 50 in core), `offset?` (≥0), `cursor?` (int ≥1) | `200 { items: ApplicationListItem[], total: number, nextCursor }` — the vacancies in the pipeline, `statusChangedAt desc, id desc`. Each item: `id` (the vacancy's), `status`, `statusChangedAt`, `timedOut` (the timeout rule, as of the read), `appliedAt` (the latest `APPLIED` journal row; `null` if none), `salaryInApplication`, `usedTailoredResume`, `company` / `title` / `applyUrl` / `matchScore` / `recommendation` (both `null` on a vacancy `record_application` created without a score), and `comments: { id, createdAt, body, source }[]`, oldest first, the `ANALYZER` one included, plus the derived `companyMatchCount` (every vacancy, any status, of the same company — an equal `companyKey`, [ADR-0032](decisions/0032-same-company-normalised-name.md) — the same count as `GET /vacancies`'; the list only, not the single-row responses). Every `ApplicationListItem` response (`GET /:id`, both `PATCH`es, `POST`'s `application`) carries `timedOut` too | `400` bad query (e.g. `limit=1000`, a triage `status`, `state=TIMEOUT`); `cursor` with `offset` |
| `GET /api/v1/applications/:id` | — | `200` `ApplicationListItem` | `404` unknown id or not in the pipeline; `400` non-integer id |
| `PATCH /api/v1/applications/:id/status` | `{ status: VacancyStatus, comment?: string }` — any status (the UI offers the pipeline); every call is journaled and moves `statusChangedAt`, a repeated pipeline status included. A non-blank `comment` becomes a new dated `USER` row in `comments` (append-only) | `200` `ApplicationListItem` | `404` unknown id; `400` bad `status`; `422` `SameStatusError` — a triage status the vacancy already has, or `AnalysedNotNewError` — `NEW` on an analysed vacancy (nothing written) |
| `PATCH /api/v1/applications/:id` | `UpdateApplicationDto`: `salaryInApplication?` (`@IsString`, `null` or blank clears), `usedTailoredResume?` (`@IsBoolean`), `comment?` (`@IsString`; a non-blank one is added as a `USER` comment, it edits none) — a field left out is untouched; anything else (e.g. `status`) is stripped | `200` `ApplicationListItem` | `404` unknown id; `400` DTO |
| `GET /api/v1/stats` | — | `200 { logged, awaitingAnalysis, awaitingTriage, recommended, notRecommended, applied, declined, unavailable, responded, interview, recruiterScreen, pipeline: { byStatus, active, timedOut, total }, recent }` — `applied` / `responded` / `interview` count the `StatusChange` journal ("ever reached"); `declined`, `unavailable`, `recruiterScreen` and `pipeline` the current status; each field is defined in [ADR-0031](decisions/0031-stats-endpoint.md); `logged` counts every vacancy, analysed or not ([ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)); `awaitingAnalysis` the ones in `NEW`; `notRecommended` each vacancy once that is `FILTERED_OUT` or was analysed `SKIP`. `byStatus` has every pipeline status as a key — `APPLIED`, `RECRUITER_SCREEN`, `REPLIED`, `INTERVIEW`, `AWAITING`, `OFFER`, `REJECTED` — (0 when none); `responded` counts `AWAITING`, `interview` does not; `recent` is the 6 latest **pipeline** `StatusChange` rows (triage moves left out), `createdAt desc, id desc`, each `{ id, vacancyId, status, createdAt, company, title }` | — |

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

**`SaveVacancyDto`** — `company`, `title`, `fullText`, `estimationComment` (stored as
the vacancy's `ANALYZER` comment): `@IsString @IsNotEmpty`; `applyUrl`: `@IsUrl` (http(s),
scheme required — as intake's `url`; a non-link is a `400`, as MCP's `z.url()` refuses
it. Canonicalization stays in `core`, and so does the last guard: a non-http(s) url
that reached `save()` would get a synthetic `tracker://` key); `matchScore`:
`@IsInt @Min(0) @Max(100)`; `recommendation`: `@IsIn(RECOMMENDATION_INPUT_VALUES)`
(EN + Ukrainian, normalized in `save()`).

**Error body** — `DomainExceptionFilter`: `{ statusCode, error: "<ErrorName>",
message }` — `422` for a `DomainError` unless its `STATUS_OF` map says otherwise:
`AlreadyAnalysedError` → `409`, `VacancyNotFoundError` → `404`. Nest defaults for
400/404: `{ statusCode, message, error }`. A bad recommendation is a 400 first (the
DTO's `@IsIn`) — [ADR-0009](decisions/0009-domain-errors-and-configure-app.md).

**CORS** — `app.enableCors({ origin: WEB_ORIGIN, credentials: true })`: one exact
origin, which is also Better Auth's `trustedOrigins`. `AuthModule`'s own CORS is off
(`disableTrustedOriginsCors`; it would not allow `PATCH`).

> **What this constrains — breaks if you change it**
> - Changing `POST /vacancies/intake`'s body or result → any n8n workflow calling
>   it (not in this repo; this is n8n's way in) and
>   `apps/api/test/vacancies.e2e.spec.ts`.
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
>   fields — `companyMatchCount`, `hasAnalysis`, `hasText` — go through one private
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

Fifteen tools, registered in `createServer()` — each domain owns its own
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

To browse the tools and try them, run `npm run mcp:inspect` (the MCP Inspector over the
server on stdio) — it shows what `tools/list` returns, so it is always the real set.

| Tool | Input | Output | Not-found / error |
| --- | --- | --- | --- |
| `save_vacancy` | `company, title, applyUrl` (`.url()`), `fullText`, `matchScore` (int 0–100), `recommendation` (EN + UA), `estimationComment` | `{ success: boolean, vacancy: { id, company, title } }` — `success` is `true` when the analysis was stored: a new vacancy, or one `intake_vacancy` created without an analysis (attached, with `fullText` when the row had none — core's `attached`); `false` when the existing vacancy already had an analysis and this one was dropped | `DomainError` → `{ isError: true, content: [message] }` |
| `save_vacancies_batch` | `{ vacancies: [...] }` — array (1–100) of the same shape as `save_vacancy`'s input | `[{ success, vacancy: { id, company, title } }, ...]`, one entry per input, same order and same per-item shape as `save_vacancy` — not transactional, so one item's dedup/skip doesn't affect the others | array size outside 1–100 → schema-validation error; `DomainError` → `{ isError: true, content: [message] }` |
| `submit_analysis` | `id` (int), `matchScore` (int 0–100), `recommendation` (EN + UA), `estimationComment` | `{ success: true, vacancy: { id, company, title } }` — the analysis of a vacancy stored without one; from `NEW` the status moves by the rule, any other status is untouched | already analysed (`AlreadyAnalysedError`, nothing written) / unknown id → `isError` |
| `submit_analyses_batch` | `{ analyses: [...] }` — array (1–10, `ANALYSIS_BATCH_MAX`) of `submit_analysis`'s input | `[{ success: true, vacancy: { id, company, title } }, ...]`, same order — **transactional** (`VacancyService.submitAnalyses`): one failing item writes none | array size outside 1–10 → schema-validation error; `DomainError` on any item → `isError`, nothing persisted |
| `get_vacancy` | `{ id: int }` | the full `Vacancy`, with `status`, `comments`, `estimationComment` and `timeline` | unknown id → `{ isError: true, content: ["Vacancy <id> not found"] }` |
| `get_vacancies_batch` | `{ ids: int[] }` (1–10) | an array of what `get_vacancy` returns, `fullText` included, in the order of `ids` — the queue's read step | any unknown id → `isError` naming them; array size outside 1–10 → schema-validation error |
| `list_vacancies` | `recommendation?` (EN only), `status?` (an array — any of them), `hasText?` (boolean — with / without posting text), `applyUrl?` (exact after normalization), `company?`, `title?` (both ILIKE `%term%`, case-insensitive), `limit?` (1–100), `offset?` (≥0) | `{ items, total }` — no `fullText`; `matchScore` / `recommendation` `null` on a vacancy not analysed yet; each item also carries `companyMatchCount`, `hasAnalysis` and `hasText` (derived, see the list-item note under the REST table) | — |
| `record_application` | `vacancyId`, or `company` + `title` — exactly one of the two, `applyUrl?` (`.url()`), `matchScore?` (int 0–100), `estimationComment?` (the `ANALYZER` comment of a vacancy it creates), `salaryInApplication?`, `usedTailoredResume?`, `comment?` (a `USER` comment), `status?` | `{ success: true, application: { id, company, title } }` — `id` is the vacancy's; find-or-creates the vacancy (a created one has no text, and no analysis unless `matchScore` is given) and moves it to APPLIED (then `status?`, a pipeline stage); use `list_vacancies`/`list_applications` to see `resolution`-equivalent state | `DomainError` (blank input / ambiguous match / already in the pipeline) → `{ isError: true, content: [message] }` |
| `record_applications_batch` | `{ applications: [...] }` — array (1–100) of the same shape as `record_application`'s input | `[{ success: true, application: { id, company, title } }, ...]`, one entry per input, same order and same per-item shape as `record_application` — **transactional**: runs in one `$transaction` (`ApplicationService.recordMany`), so one failing item rolls back the whole batch | array size outside 1–100 → schema-validation error; `DomainError` on any item → `{ isError: true, content: [message] }`, nothing persisted |
| `list_applications` | `status?` (one pipeline status), `applyUrl?` (exact after normalization — an email's posting link), `search?` (company OR title), `company?`, `title?` (each independent — given with `search` and/or each other, they AND, not OR; all three ILIKE `%term%`, case-insensitive), `limit?` (1–500), `offset?` (≥0) | `{ items: ApplicationListItem[], total }` — the pipeline, last move first; `id` is the vacancy's; each item carries `timedOut` and `companyMatchCount`, as over REST | — |
| `update_vacancy_status` | `{ id?: int, company?: string, title?: string, status, comment?: string }` — any `VacancyStatus`; exactly one of `id` or `(company, title)` (case-insensitive match, among the vacancies already in the pipeline only); every pipeline call is an event, the same status included — once per real event; a triage status the vacancy already has is refused; `comment` becomes a new dated `AGENT` comment, earlier ones untouched | `{ success: true, vacancy: { id, company, title } }` — use `get_vacancy` / `list_applications` to see the resulting `status` / `comments` | neither id nor company+title given, unknown id, or unmatched `(company, title)` (a vacancy never applied to included) → `isError` "not found"; 2+ applied vacancies matching `(company, title)` → `isError` listing candidate ids; a triage repeat → `isError` "already <status>"; `NEW` on an analysed vacancy → `isError` |
| `update_application` | `{ id: int, salaryInApplication?: string, usedTailoredResume?: boolean }` — a field left out is untouched, a blank `salaryInApplication` clears it; no status move, no comment | `{ success: true, application: { id, company, title } }` | unknown id → `isError` "not found" |
| `add_comment` | `{ id: int, body: string (non-blank), source?: 'USER' \| 'AGENT' }` — default `AGENT`; a new dated comment on any vacancy, earlier ones untouched, no status move | `{ success: true, vacancy: { id, company, title } }` | unknown id → `isError` "not found"; blank `body` → `isError` |
| `intake_vacancy` | `url` (`z.httpUrl()`, raw — core normalizes), `company`, `title` (non-blank), `source?` — no posting text over MCP | `{ new: boolean }` — a new posting is **created** by the same call as a vacancy in status `NEW`, unanalysed ([ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)); `save_vacancy` then attaches the analysis. A link alone is looked up with `list_vacancies({ applyUrl })` before the page is fetched for its company and title | a missing or non-http(s) url, a missing or blank company or title → schema-validation error (`isError`) |
| `intake_vacancies_batch` | `{ entries: [...] }` — array (1–100) of `intake_vacancy`'s input | `{ new: string[] }` — the url of each new entry exactly as sent, created by this call; **transactional**, in order, so a posting twice in one call is new only once | array size outside 1–100, or any entry without an http(s) url, a company or a title → schema-validation error, nothing written |

`stdout` is reserved for the MCP protocol — all logging goes to `stderr`
(`console.error` in `apps/mcp/src/index.ts`).

**Over HTTP** ([ADR-0035](decisions/0035-mcp-over-http-oauth-resource-server.md)) —
`apps/mcp/src/http.ts` (`npm run dev:mcp:http`, port `MCP_HTTP_PORT`, 3001) serves the
same tools as Streamable HTTP at `MCP_PUBLIC_URL`'s path (`/mcp`), to an OAuth token or
an API key (`Bearer jsc_…`, [ADR-0039](decisions/0039-api-keys-per-user.md)); stdio acts
as the owner of `JSC_API_KEY`, verified at boot.

- `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728, path-inserted) →
  `{ resource: MCP_PUBLIC_URL, authorization_servers: ["${BETTER_AUTH_URL}/api/auth"],
  bearer_methods_supported: ["header"] }`. The authorization server's own metadata is
  the API's (`/.well-known/oauth-authorization-server/api/auth`).
- `POST /mcp` wants `Authorization: Bearer <access token>`: a JWT the API's
  `oauthProvider` signed (`typ: at+jwt`), checked against the API's JWKS
  (`${AUTH_URL}/api/auth/jwks`, cached) for `iss` = `${BETTER_AUTH_URL}/api/auth`,
  `aud` ∋ `MCP_PUBLIC_URL`, `exp`. No token, or a bad one → `401` with
  `WWW-Authenticate: Bearer error="invalid_token", …,
  resource_metadata="<the document above>"`. The API unreachable → `500`. A client gets
  a JWT only when it sends `resource=<MCP_PUBLIC_URL>` (RFC 8707); without it the token
  is opaque and refused here.
- Stateless: each `POST` gets its own server and transport, no `Mcp-Session-Id`;
  `GET` / `DELETE /mcp` → `405`. JSON bodies up to 5 MB (as the API — the batch tools
  carry posting text). The `Host` header must be `MCP_PUBLIC_URL`'s host, else `403`
  (DNS-rebinding guard).

> **What this constrains — breaks if you change it**
> - Changing `save_vacancy`'s output shape → the external
>   vacancy-match-analyzer prompt (not in this repo) reads `success` (renamed from
>   `created`) — update it there if you change this again — and
>   `apps/mcp/src/server.spec.ts` (which destructures `{ success, vacancy }`).
> - Adding a tool / changing an input schema → `apps/mcp/src/server.spec.ts`
>   (the in-memory `Client` calls each tool by name).
> - Writing anything to `stdout` from the MCP process → corrupts the protocol
>   stream; the client disconnects.
>   (stdio only; the HTTP entrypoint logs to `stdout` freely.)
> - Changing `MCP_PUBLIC_URL` (scheme, host, port or path) without the API seeing the
>   same value → every token's `aud` misses and every call is a `401`; the host also
>   gates the `Host` check. The API seeds an `OauthResource` row per value, insert-only.

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
