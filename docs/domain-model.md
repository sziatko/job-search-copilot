# Domain model

Source of truth: [`packages/core/prisma/schema.prisma`](../packages/core/prisma/schema.prisma),
[`vacancy.service.ts`](../packages/core/src/vacancies/vacancy.service.ts),
[`application.service.ts`](../packages/core/src/applications/application.service.ts) and
[`status.ts`](../packages/core/src/domain/status.ts). The shape as a whole:
[ADR-0029](decisions/0029-one-vacancy-table.md).

## Terms

| Term | Meaning |
| --- | --- |
| **analyzer** | Claude, scoring a vacancy through the MCP tools, driven by the owner's skills (not in this repo). |
| **analysis** | What the analyzer writes once: `matchScore`, `recommendation`, and its reasoning as an `ANALYZER` comment (read back as `estimationComment`). |
| **intake** | Taking a posting in before any analysis: n8n's `POST /vacancies/intake` or the MCP `intake_*` tools. The posting lands in `NEW`. |
| **triage** | The user's first decision on an analysed vacancy: apply, decline, save for later. The statuses before the pipeline. |
| **pipeline** | The statuses after applying, `APPLIED` … `REJECTED`. An *application* is a vacancy in the pipeline, not a row of its own. |
| **journal** | `StatusChange`: one row per status move. `status` on the vacancy is its cache. |
| **event** | A pipeline status written again — a second interview round. Journaled; a triage repeat is refused. |
| **timeout** | An open pipeline status with no move for 30 days. Derived, never stored. |
| **placeholder** | A vacancy `record_application` created because no match existed: no posting text, an analysis only if a score was passed. |
| **context** | The statuses one web page lists (`STATUS_CONTEXT`); `ALL` in its filter means those, not the whole table. |
| **owner** | The user a vacancy belongs to (`userId`). Every query is scoped to one. |

## `Vacancy`

One table. One row per vacancy, keyed for the outside world by `applyUrl` — the
analyzer's fields, written once, and the user's current state beside them. A vacancy
can exist before its analysis: intake takes a posting in as `NEW`, both analysis fields
`null` ([ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)). An
"application" is not a row of its own: it is a vacancy whose `status` is in the
pipeline.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `Int` autoincrement | Primary key. Server-assigned; the URI for a row. |
| `createdAt` | `DateTime @default(now())` | When first saved. |
| `updatedAt` | `DateTime @default(now()) @updatedAt` | Bumped on any row update — a status, salary or CV change; analysis fields are never updated (analyze-once). Not a semantic date: read `statusChangedAt` or the journal. |
| `userId` | `String` → `User` | The owner, `onDelete: Cascade`. Every query reaches the row through `forUser` (core), which adds it; `Comment` and `StatusChange` are owned through their vacancy. Leads the list indexes. → [ADR-0038](decisions/0038-multi-user-shared-schema.md) |
| `company` | `String` | |
| `title` | `String` | |
| `applyUrl` | `String`, `@@unique([userId, applyUrl])` | **The natural key, per user** — two users may track one posting. The unique constraint is what enforces analyze-once at the DB level. Stored **canonicalized** — `normalizeApplyUrl()` drops the query string, the fragment and a trailing slash, so the spellings one posting arrives in share one row. Exception: a domain with a site rule keeps the param that *is* the vacancy id — Indeed is stored as `<locale>.indeed.com/viewjob?jk=…`, locale and all. The raw listing URL is not kept. → [ADR-0023](decisions/0023-canonical-applyurl.md) |
| `companyKey` / `titleKey` | `String?` | The posting's match by name — intake's second match, and `record()` / `updateStatusByVacancy`'s lookup: `normalizeCompanyKey` / `normalizeTitleKey` (`identity.ts` — lowercase, punctuation collapsed, company legal suffixes stripped). `@@index([userId, companyKey, titleKey])`. Written on every create (intake, `save()`, `record()` — `matchKeys`); `null` only when the name normalizes to nothing (`—`), and such a row is matched by url only. Not `companyGroupKey()` — ADR-0032's company identity, which also drops places and notes, and is not stored (`identity.ts` says why the two differ). |
| `source` | `String?` | Where intake found it (`justjoin`, `linkedin`, …). Free text, so a new source needs no migration; `null` on rows from `save()` and `record()`. |
| `fullText` | `String? @db.Text` | The whole vacancy text; `null` = none yet (intake without text, a placeholder). Text too short to be a posting is stored as `null` on every path (`posting-text.ts`). A list item carries `hasText` (`fullText !== null`, derived) and `list({ hasText })` filters on it. Can be large. Kept on the row, not a side table — see "fullText stays on the row" below. |
| `matchScore` | `Int?` | 0–100. App-validated *and* DB-constrained — see "matchScore CHECK" below. `null` = not analysed yet. |
| `recommendation` | `Recommendation?` enum | **The analyzer's call.** `APPLY` \| `APPLY_WITH_CAVEATS` \| `SKIP`; `null` = not analysed yet — with `matchScore`, both or neither (a CHECK). |
| `comments` | `Comment[]` | Every note on the vacancy — see [`Comment`](#comment) below. The analyzer's reasoning is its `ANALYZER` row: reads still return it as `estimationComment` (`string \| null`), derived from the first one. |
| `status` | `VacancyStatus` enum, default `NEW` | **The user's call** (one exception: the analysis moves it out of `NEW`, below). A cache of the latest [`StatusChange`](#statuschange). The values are in the table below. |
| `statusChangedAt` | `DateTime @default(now())` | The latest `StatusChange`'s date: the last move. Timeout and the `/applications` sort read it. |
| `salaryInApplication` | `String?` | Free text ("130 PLN/h"), entered when applying. |
| `usedTailoredResume` | `Boolean @default(false)` | Entered when applying. |
| `statusChanges` | `StatusChange[]` | The journal — see below. |

Indexes: `@@index([userId, recommendation])`, `@@index([userId, status, statusChangedAt])`,
`@@index([userId, companyKey, titleKey])`, and GIN `gin_trgm_ops` indexes on `company` and
`title` (see "pg_trgm index" below).

The statuses — triage (`TRIAGE_STATUSES` in `status.ts`), then the pipeline
(`PIPELINE_STATUSES`), each pipeline one saying whose move it is:

| Status | Means |
| --- | --- |
| `NEW` | Waiting for an analysis. Never on an analysed row (a CHECK). |
| `FILTERED_OUT` | Screened out before triage: the analyzer's `SKIP`, or the user. |
| `NOT_REVIEWED` | Analysed, waiting for the user's triage. |
| `SAVED_FOR_LATER` | A bookmark: maybe later. |
| `DECLINED` | The user read the analysis and chose not to apply. |
| `UNAVAILABLE` | The posting no longer takes applications. Triage only. |
| `APPLIED` | Applied, waiting for a first answer. |
| `ACTION_NEEDED` | The company wrote; the user must act (a question, a call to book, a test task). |
| `INTERVIEW` | An interview is set or done. |
| `AWAITING` | The user answered or did what was asked; waiting on the company. |
| `OFFER` | An offer. Closed. |
| `REJECTED` | The company said no. Closed. |

`GET /stats` counts `ACTION_NEEDED` and `AWAITING` as *responded*, not *interview*.

## Two independent axes: `recommendation` vs `status`

This is the central modelling decision. The analyzer's suggestion and the user's
decision are **different things on different axes**:

- `recommendation` — set once, with `matchScore`, from the analyzer (`save()`,
  `submitAnalysis()`, or a placeholder given a score). Never changed afterwards; `null`
  until then.
- `status` — set only through `writeStatus()`, from the user (or an agent acting for
  them). Starts at `NEW`. Never inferred from `recommendation` — **with one exception**:
  the analysis moves a vacancy out of `NEW` in the transaction that writes it, `SKIP` →
  `FILTERED_OUT`, anything else → `NOT_REVIEWED` (`statusAfterAnalysis` in `status.ts`;
  the rule is `core`'s, never an agent's). It only fires from `NEW`, so it never
  clobbers the user's progress ([ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)).

**Status lifecycle** (enforced by the UI, not the DB — the API allows any move,
including back to `NOT_REVIEWED`; the one DB rule is "an analysed row is never `NEW`",
which `writeStatus` refuses first as `AnalysedNotNewError`, REST `422`). The web draws
it as each row's buttons (`actionsFor` in `VacancyTable`; the vacancy page's status
select offers the same): a `NEW` row gets Filter out only, a `FILTERED_OUT` one Back to
queue only without an analysis, the rest the `/vacancies` actions:

```
     analysis, not SKIP               ┌─▶ SAVED_FOR_LATER ─┬─▶ APPLIED ─▶ ACTION_NEEDED ⇄ AWAITING ─▶ INTERVIEW ─▶ AWAITING ─┬─▶ OFFER
NEW ─────────────────▶ NOT_REVIEWED ──┼────────────────────┘      (any pipeline status) ─────────────────────────────────────┴─▶ REJECTED
 │ ▲                                  ├─▶ DECLINED ◀── (from SAVED_FOR_LATER too)
 │ │ back to the queue                └─▶ UNAVAILABLE ◀── (from SAVED_FOR_LATER too)
 │ │ (no analysis only)
 ▼ │
FILTERED_OUT ◀── analysis SKIP, or the user
```

`NEW`'s only exits: an analysis (by the rule), or the user's `FILTERED_OUT`. A
placeholder (`record()`) is journaled `NEW` → `APPLIED` without passing `NOT_REVIEWED`.

Each page has its own statuses, its **context** (`STATUS_CONTEXT` in the web's
`vacancies/types.ts`), and `ALL` in a page's status filter means them, never the whole
table:

- `/vacancies` — `NOT_REVIEWED`, `SAVED_FOR_LATER`, `DECLINED`, `UNAVAILABLE`. It
  defaults to `NOT_REVIEWED` and sorts by `recommendation` (APPLY first, the unanalysed
  last), then `matchScore` desc; `ALL` sends the four. A row moved to `APPLIED` leaves
  it for `/applications`; a stale `?status=APPLIED` falls back to the default.
- `/applications` — the pipeline. Its endpoint lists only the pipeline, so `ALL` sends
  no `status`.
- `/inbox` — `NEW`, `FILTERED_OUT`, in three tabs and no status filter: Queue (`NEW`
  with posting text), No text (`NEW` without), Filtered out (`FILTERED_OUT`).

> **What this constrains — breaks if you change it**
> - Making the analysis move a status from anything but `NEW`, or a status write touch
>   analysis fields → the analyzer would clobber the user's progress (or vice-versa).
>   The two writers overlap only in the move out of `NEW`.
> - Adding a `Recommendation` value → a migration (`ADD VALUE … BEFORE`/`AFTER`: the
>   enum's order is `sort=recommended`'s order, ADR-0030). Core, the MCP enum and the
>   API DTOs follow the Prisma enum; the web does not — `recommendationSchema`
>   (`vacancies/types.ts`), `constants.ts` and `RecommendationTag`.
> - Adding a `VacancyStatus` value → there is no single source
>   ([ADR-0012](decisions/0012-web-hand-written-contract.md)). Touch:
>   - core: a migration (`ADD VALUE … AFTER`), `TRIAGE_STATUSES` or `PIPELINE_STATUSES`
>     in [`status.ts`](../packages/core/src/domain/status.ts), a `StatsService` count if
>     the dashboard shows it;
>   - MCP: `PipelineStatusEnum` for a pipeline one (`VacancyStatusEnum` follows Prisma),
>     and the tool descriptions and `SERVER_INSTRUCTIONS` that list statuses;
>   - API: `@IsIn(PIPELINE_STATUSES)` follows; `@IsEnum(VacancyStatus)` too;
>   - web: `vacancyStatusSchema` and the page's `STATUS_CONTEXT`, the `extract` lists
>     (`VacancyAction`, `RowAction`), `STATUS_LABELS` / `STATUS_TAGS`, `VacancyTable`'s
>     `ROW_BUTTONS` / `actionsFor` and `StatusFilterSelect` for a `/vacancies` one,
>     `InboxPage`'s `TABS` for an inbox one, `VacancyPage`'s `CLOSED_BAD` if it ends a
>     vacancy, the `APPLICATION_STATUS_*` maps for a pipeline one;
>   - the skills that list statuses (re-upload them).

## `StatusChange`

The status journal: one row per change of status. Append-only.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `Int` autoincrement | The tie-break for rows that share a `createdAt`. |
| `createdAt` | `DateTime` | The date of that change — the only one. |
| `status` | `VacancyStatus` | The status moved to. |
| `vacancyId` | `Int` | FK to `Vacancy`, `onDelete: Cascade`. `@@index([vacancyId, createdAt])`. |

**`writeStatus(tx, vacancyId, status, at = now)` is the only writer of status.** In the
caller's transaction it moves `status` + `statusChangedAt` and inserts the row, both
dated `at`. **Every pipeline call is an event** — the status the vacancy already has is
journaled too and moves the date: the next interview round is `INTERVIEW` again, and the
timeout clock restarts from it. So a caller writes once per real event (the email sync
skips reminders). **A triage repeat is refused:** a `TRIAGE_STATUSES` status the vacancy
already has carries no event, so `writeStatus` throws `SameStatusError` (API 422, MCP
`isError`) and writes nothing; so does `NEW` on an analysed vacancy
(`AnalysedNotNewError`), which the CHECK would otherwise refuse as a 500; the web does not offer a row's current status
([ADR-0029](decisions/0029-one-vacancy-table.md)). Every vacancy's journal
starts with a `NEW` row dated the day it came in (`firstStatus`, on every create path).
`save()` journals `NEW`, then the rule's status, both dated now.

**The applied date** is the `createdAt` of the latest `APPLIED` row — `appliedAt` on an
`/applications` item. A vacancy set straight past `APPLIED` has none (`null`).

**Active / Timeout are derived, not stored.** The pipeline splits on
`statusChangedAt`: `REJECTED` and `OFFER` are *closed*; of the rest, anything whose last
move is more than 30 days old (`statusChangedAt < now − 30 days`) is a *timeout*, and
the remainder is *active*. So `total = active + timeout + rejected + offer`, with no
overlap and no remainder. The window floats: from applying while `APPLIED`, from the
interview after `INTERVIEW`. There is deliberately no column and no job for it — the
rule lives in `core` (`TIMEOUT_DAYS`, `timedOutWhere` in `packages/core/src/domain/status.ts`),
`GET /stats`' `pipeline` counts it, and the `/applications` list filters on it and
flags each item `timedOut`
([ADR-0022](decisions/0022-timeout-derived-until-scheduled.md),
[ADR-0031](decisions/0031-stats-endpoint.md)). `/applications`'s
filter carries three values that are **not** stored statuses — `ALL`, `ACTIVE`,
`TIMEOUT` — and none of them is ever sent as a `status`: `ACTIVE` / `TIMEOUT` go out
as the separate `state=active|timedOut` param, `ALL` as neither (the endpoint's own
scope, the pipeline, is the page's context).

> **What this constrains — breaks if you change it**
> - Writing `status` anywhere but `writeStatus` → the cache and the journal disagree,
>   and timeout, the sort and `appliedAt` read the wrong date.
> - Turning a same-status write back into a no-op → a second interview round leaves
>   no trace, and the timeout clock keeps counting from the first one.

## Applications: the pipeline view

`ApplicationService` is `/applications`' view of the same rows, not a second status
zone: its `id` is the vacancy's, and applying moves the vacancy's own `status`.

- **`list` / `getById`** see only the pipeline. `list` orders by
  `statusChangedAt desc, id desc` — a fresh application tops the list; a comment or
  an edit does not reorder.
- **Record-or-link** (`record`, one transaction): link by `vacancyId` (web), or (MCP) to
  the vacancy with the passed `applyUrl`, else a unique `(companyKey, titleKey)` match —
  intake's match, an unknown url falling through to the name; zero matches → **create** a
  placeholder `Vacancy` (`fullText` `null`; no analysis unless the caller passed a
  `matchScore` — then `recommendation` is the caller's or derived from it, written once
  the row has left `NEW`; an `ANALYZER` comment only when one was passed); more than
  one → `AmbiguousVacancyMatchError`. Every vacancy is a candidate, the `NEW` and
  `FILTERED_OUT` ones included. A vacancy already in the pipeline →
  `AlreadyAppliedError`; one set back to triage can be applied to again. Then
  `writeStatus(APPLIED)` — and `writeStatus(status)` when the caller records it further
  along, so the applied date is journaled either way — and salary / CV / comment.
  [ADR-0019](decisions/0019-record-or-create-vacancy.md).
- **`updateStatus` / `updateStatusByVacancy`** move a vacancy to any status (the MCP
  `update_vacancy_status`). `updateStatus` takes any vacancy by id;
  `updateStatusByVacancy` matches `(companyKey, titleKey)`, as `record` does, **among the
  vacancies already in the pipeline only** — an email about a vacancy never applied to
  is "not found" and goes to need-attention — and **never creates** anything.
- **`list` (both services)** also takes `applyUrl`, compared exactly after the
  normalization `save` applies (`applyUrlKey`; an unusable url is compared raw, so a
  `tracker://` key still matches) — how an email's posting link finds its application.
- **`update`** edits salary / CV and appends a `USER` comment.

> **What this constrains — breaks if you change it**
> - Adding a field `/applications` needs → `APPLICATION_SELECT` + `flatten()` in
>   `application.service.ts` **and** `applicationListItemSchema` in the web contract
>   (parallel maintenance — [ADR-0012](decisions/0012-web-hand-written-contract.md)).

## `Comment`

One note on a `Vacancy`, whoever wrote it — [ADR-0029](decisions/0029-one-vacancy-table.md).
**Append-only**: no surface edits or deletes one. Read oldest first.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `Int` autoincrement | Primary key; the tie-break for notes that share a `createdAt`. |
| `createdAt` | `DateTime @default(now())` | When the note was written. |
| `body` | `String @db.Text` | Trimmed; a blank note is never stored. |
| `source` | `CommentSource` enum | Who wrote it: `ANALYZER` \| `USER` \| `AGENT`. |
| `vacancyId` | `Int` | FK to `Vacancy`, `onDelete: Cascade`. `@@index([vacancyId, createdAt])`. |

The writers, by source:

- **`ANALYZER`** — with the analysis, through `writeAnalysis` (`VacancyService.save()`
  and `submitAnalysis()`; a save on an analysed row writes nothing: analyze-once), and
  `record()` when it creates a placeholder and was given an `estimationComment`. At most
  one per vacancy in practice; reads take the first — so a placeholder created with a
  note and scored later by `submitAnalysis` still shows the note.
- **`USER`** — `record()`'s and `update()`'s `comment`, and `updateStatus()` over REST.
- **`AGENT`** — `updateStatus()` / `updateStatusByVacancy()` over MCP.

`hasAnalysis` on a vacancy list item is `recommendation !== null` (ADR-0033).

## Intake

How a posting enters `Vacancy` before any analysis — `VacancyIntakeService`
(`vacancy-intake.service.ts`), [ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md).

- An entry needs an http(s) `url`, a `company` and a `title`; `source` and `fullText`
  are optional. Without the three it is skipped (batch) or an
  `InvalidIntakeEntryError` (one).
- Match by `applyUrl` (normalized), else by `(companyKey, titleKey)`, the oldest row.
- A miss creates the vacancy in `NEW` (`firstStatus`), with `source` and `fullText` when
  given. A hit only gets the text it lacked — never a status, a source or an analysis.
- It reports `{ new }`, nothing else.

## Analyze-once

A vacancy can exist before its analysis, so the rule is "the analysis is written
once". `save()` and `submitAnalysis()` write it through `writeAnalysis`
(`vacancy.service.ts`), in the caller's transaction: first a conditional write
(`WHERE recommendation IS NULL`, which takes the row lock — a concurrent analysis waits,
then finds the row analysed), then from `NEW` the rule's status through `writeStatus`,
then the analysis and its `ANALYZER` comment. Any status but `NEW` is left as it is (a
pipeline placeholder). The one other writer is `record()`, for a placeholder it has just
created in the same transaction: no other analysis can reach that row, so it writes the
score itself once the row is `APPLIED`.

- `save()`: *find by the user's `applyUrl`* — none → create it in `NEW` and write the analysis
  (`created: true`); found without an analysis (intake took it in) → attach this one,
  and `fullText` when the row has none (`attached: true`); found with one → return it
  untouched (both `false`). The `(userId, applyUrl)` unique constraint is the real guard — a lost race on
  `create` (P2002) is caught and re-resolved to the existing row. MCP's `success` is
  `created || attached`; REST answers `201` only for `created`.
- `submitAnalysis({ id, … })` / `submitAnalyses([...])` (≤ `ANALYSIS_BATCH_MAX` = 10,
  one transaction — one failure writes none): a vacancy that has an analysis →
  `AlreadyAnalysedError` (REST `409`, MCP `isError`), an unknown id →
  `VacancyNotFoundError` (`404`).

Rationale and the HTTP consequences (POST → `201 + Location` / `200`):
[ADR-0005](decisions/0005-analyze-once.md).

> **Breaks if you change it:** switching `save()` back to an upsert →
> re-submitting a vacancy would overwrite the stored analysis; the API's
> `200`-on-existing branch and the MCP `created` flag become meaningless; the
> "second save leaves it untouched" tests fail.

## `recommendation` input

English only, exact: `APPLY`, `APPLY_WITH_CAVEATS`, `SKIP` — the Prisma enum, on input
and in every filter. MCP checks it with `z.enum(Recommendation)`, REST with
`@IsEnum(Recommendation)`; `parseRecommendation()` in core is the last guard and throws
`InvalidRecommendationError` (a `DomainError`) on anything else.

> **Breaks if you change it:** accepting another spelling means mapping it on the way
> in — storing it raw is impossible (the DB enum can't hold it), and every filter
> (`@IsEnum`, the zod enum) compares against the English value.

## DB-level rules (not expressible in the Prisma schema DSL)

Added by hand in `--create-only` migrations — see
[`packages/core/prisma/README.md`](../packages/core/prisma/README.md).

- **The analysis CHECKs** (`20261003130100_vacancy_log_into_vacancy`,
  [ADR-0033](decisions/0033-unscored-vacancies-in-one-table.md)):
  `Vacancy_analysis_both_or_neither` — `("matchScore" IS NULL) = ("recommendation" IS NULL)`;
  `Vacancy_new_is_unanalysed` — `"status" <> 'NEW' OR "recommendation" IS NULL`.
  > Breaks if you change it: an insert or update that writes an analysis on a `NEW` row,
  > or one field of it, is rejected — `save()` and `record()` create the row unanalysed,
  > move it out of `NEW`, then write the analysis.
- **`matchScore` CHECK** (`20260909224918_add_match_score_check`):
  `CHECK ("matchScore" >= 0 AND "matchScore" <= 100)`. The app validates 0–100 too
  (DTO, MCP zod); the DB does not rely on it.
  > Breaks if you change it: widening the app-level bound without dropping the
  > constraint → inserts silently rejected by Postgres with a constraint error.
- **`pg_trgm` GIN index on `company`** (`20260909225003_company_trigram_index`):
  `list({ company })` filters with `contains` + `mode: 'insensitive'`, i.e.
  `ILIKE '%term%'`, which a b-tree can't serve. The extension is declared in
  `datasource.extensions = [pg_trgm]` (needs `previewFeatures =
  ["postgresqlExtensions"]`). `title` has the same index.
  > Breaks if you change it: removing `previewFeatures`/`extensions` from the
  > schema → `prisma migrate` wants to drop the extension and the GIN index;
  > company search falls back to a full scan.
- **`fullText` stays on the row** (not a 1:1 side table): Postgres TOASTs large
  `TEXT` out-of-line, and every read path except `getById` projects it out
  (`LIST_SELECT`), so queries that don't need it already don't pay for it. A side
  table would duplicate what TOAST does for free.
