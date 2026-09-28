# Domain model

Source of truth: [`packages/core/prisma/schema.prisma`](../packages/core/prisma/schema.prisma),
[`vacancy.service.ts`](../packages/core/src/vacancy.service.ts),
[`application.service.ts`](../packages/core/src/application.service.ts) and
[`status.ts`](../packages/core/src/status.ts). The shape as a whole:
[ADR-0029](decisions/0029-one-vacancy-table.md).

## `Vacancy`

One table. One row per vacancy, keyed for the outside world by `applyUrl` — the
analyzer's fields, written once, and the user's current state beside them. An
"application" is not a row of its own: it is a vacancy whose `status` is in the
pipeline.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `Int` autoincrement | Primary key. Server-assigned; the URI for a row. |
| `createdAt` | `DateTime @default(now())` | When first saved. |
| `updatedAt` | `DateTime @default(now()) @updatedAt` | Bumped on any row update — a status, salary or CV change; analysis fields are never updated (analyze-once). Not a semantic date: read `statusChangedAt` or the journal. |
| `company` | `String` | |
| `title` | `String` | |
| `applyUrl` | `String @unique` | **The natural key.** The `@unique` constraint is what enforces analyze-once at the DB level. Stored **canonicalized** — `normalizeApplyUrl()` drops the query string, the fragment and a trailing slash, so the spellings one posting arrives in share one row. Exception: a domain with a site rule keeps the param that *is* the vacancy id — Indeed is stored as `<locale>.indeed.com/viewjob?jk=…`, locale and all. The raw listing URL is not kept. → [ADR-0023](decisions/0023-canonical-applyurl.md) |
| `fullText` | `String @db.Text` | The whole vacancy text. Can be large. Kept on the row, not a side table — see "fullText stays on the row" below. |
| `matchScore` | `Int` | 0–100. App-validated *and* DB-constrained — see "matchScore CHECK" below. |
| `recommendation` | `Recommendation` enum | **The analyzer's call.** `APPLY` \| `APPLY_WITH_CAVEATS` \| `SKIP`. |
| `comments` | `Comment[]` | Every note on the vacancy — see [`Comment`](#comment) below. The analyzer's reasoning is its `ANALYZER` row: reads still return it as `estimationComment` (`string \| null`), derived from the first one. |
| `status` | `VacancyStatus` enum, default `NOT_REVIEWED` | **The user's call.** Triage — `NOT_REVIEWED` \| `SAVED_FOR_LATER` \| `DECLINED` — then the pipeline, `PIPELINE_STATUSES`: `APPLIED` \| `RECRUITER_SCREEN` \| `REPLIED` \| `INTERVIEW` \| `OFFER` \| `REJECTED`. A cache of the latest [`StatusChange`](#statuschange). `REJECTED` = the company said no; `DECLINED` = "I chose not to apply". |
| `statusChangedAt` | `DateTime @default(now())` | The latest `StatusChange`'s date: the last move. Timeout and the `/applications` sort read it. |
| `salaryInListing` | `String?` | Free text ("130 PLN/h"), entered when applying. |
| `usedTailoredResume` | `Boolean @default(false)` | Entered when applying. |
| `statusChanges` | `StatusChange[]` | The journal — see below. |

Indexes: `@@index([recommendation])`, `@@index([status, statusChangedAt])`, and GIN
`gin_trgm_ops` indexes on `company` and `title` (see "pg_trgm index" below).

## Two independent axes: `recommendation` vs `status`

This is the central modelling decision. The analyzer's suggestion and the user's
decision are **different things on different axes**:

- `recommendation` — set once by `save()`, from the analyzer. Never changed
  afterwards.
- `status` — set only through `writeStatus()`, from the user (or an agent acting for
  them). Starts at `NOT_REVIEWED`. Never inferred from `recommendation`.

**Status lifecycle** (enforced by the UI, not the DB — the API allows any move,
including back to `NOT_REVIEWED`):

```
               ┌─▶ SAVED_FOR_LATER ─┬─▶ APPLIED ─▶ RECRUITER_SCREEN ─▶ REPLIED ─▶ INTERVIEW ─┬─▶ OFFER
NOT_REVIEWED ──┼────────────────────┘      (any pipeline status) ────────────────────────────┴─▶ REJECTED
               └─▶ DECLINED ◀── (from SAVED_FOR_LATER too)
```

`/vacancies` defaults to `NOT_REVIEWED` and sorts by `recommendation` (APPLY first),
then `matchScore` desc; its "Applied" filter stands for the whole pipeline.
`/applications` shows only the pipeline.

> **What this constrains — breaks if you change it**
> - Making `save()` write a status other than the first `NOT_REVIEWED`, or a status
>   write touch analysis fields → the analyzer would clobber the user's progress (or
>   vice-versa). The two writers never overlap.
> - Adding a `Recommendation` value → the Prisma enum (migration),
>   `RECOMMENDATION_INPUT_VALUES` + `RECOMMENDATION_ALIASES` in
>   [`recommendation.ts`](../packages/core/src/recommendation.ts), the MCP `zod`
>   enums in [`vacancies.schemas.ts`](../apps/mcp/src/vacancies/vacancies.schemas.ts),
>   the `apps/api` DTOs, and the web `recommendationSchema` + `RECOMMENDATION_ORDER`.
> - Adding a `VacancyStatus` value → the Prisma enum (migration), `PIPELINE_STATUSES`
>   in [`status.ts`](../packages/core/src/status.ts) if it is a pipeline stage, the MCP
>   zod enums (`VacancyStatusEnum`, `PipelineStatusEnum`), the API DTOs
>   (`@IsEnum(VacancyStatus)`, `@IsIn(PIPELINE_STATUSES)`), and on the web
>   `vacancyStatusSchema` (+ the `extract` lists for the row actions and the pipeline),
>   `STATUS_LABELS` / `STATUS_TAGS`, and the `APPLICATION_STATUS_*` maps. There is no
>   single source — see [ADR-0012](decisions/0012-web-hand-written-contract.md).

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
dated `at`. **Every call is an event** — the status the vacancy already has is journaled
too and moves the date: the next interview round is `INTERVIEW` again, and the timeout
clock restarts from it. So a caller writes once per real event (the web sends nothing
when a row is set to the status it has; the email sync skips reminders). A new vacancy
starts with a `NOT_REVIEWED` row (`firstStatus`).

**The applied date** is the `createdAt` of the latest `APPLIED` row — `appliedAt` on an
`/applications` item. A vacancy set straight past `APPLIED` has none (`null`).
Migrated rows were backfilled from `userAction`, `appliedAt` and `statusUpdatedAt`.

**Active / Timeout are derived, not stored.** `/applications` splits the log on the
client from `statusChangedAt`: `REJECTED` and `OFFER` are *closed*; of the rest,
anything not moved for more than 30 days is a *timeout*, and the remainder is
*active*. So `total = active + timeout + rejected + offer`, with no overlap and no
remainder. The window floats: from applying while `APPLIED`, from the interview after
`INTERVIEW`. There is deliberately no column, no job, and no server-side filter for it —
the rule lives in `apps/web/src/pages/applications/constants.ts`
([ADR-0022](decisions/0022-timeout-derived-until-scheduled.md)). `/applications`'s
filter carries three values that are **not** stored statuses — `ALL`, `ACTIVE`,
`TIMEOUT` — and none of them ever crosses the wire.

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
- **Record-or-link** (`record`, one transaction): link by `vacancyId` (web), or by a
  unique case-insensitive `(company, title)` match (MCP); zero matches → **create** a
  placeholder `Vacancy` (`fullText:'N/A'`, `matchScore` from the caller or `0`,
  `recommendation` derived, an `ANALYZER` comment only when one was passed); more than
  one → `AmbiguousVacancyMatchError`. A vacancy already in the pipeline →
  `AlreadyAppliedError`; one set back to triage can be applied to again. Then
  `writeStatus(APPLIED)` — and `writeStatus(status)` when the caller records it further
  along, so the applied date is journaled either way — and salary / CV / comment.
  [ADR-0019](decisions/0019-record-or-create-vacancy.md).
- **`updateStatus` / `updateStatusByVacancy`** move a vacancy to any status (the MCP
  `update_vacancy_status`). `updateStatus` takes any vacancy by id;
  `updateStatusByVacancy` matches `(company, title)` case-insensitively **among the
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
| `id` | `Int` autoincrement | Primary key; the tie-break for notes that share a `createdAt` (some migrated ones do). |
| `createdAt` | `DateTime @default(now())` | When the note was written. Migrated notes carry the only date there was: a status note its application's then status date, the user's note its applied date, the analyzer's the vacancy's `createdAt`. |
| `body` | `String @db.Text` | Trimmed; a blank note is never stored. |
| `source` | `CommentSource` enum | Who wrote it: `ANALYZER` \| `USER` \| `AGENT`. |
| `vacancyId` | `Int` | FK to `Vacancy`, `onDelete: Cascade`. `@@index([vacancyId, createdAt])`. |

The writers, by source:

- **`ANALYZER`** — `VacancyService.save()`, with the analysis (a repeat save writes
  nothing: analyze-once), and `record()` when it creates a placeholder and was given an
  `estimationComment`. At most one per vacancy in practice; reads take the first.
- **`USER`** — `record()`'s and `update()`'s `comment`, and `updateStatus()` over REST.
- **`AGENT`** — `updateStatus()` / `updateStatusByVacancy()` over MCP.

`hasAnalysis` on a vacancy list item is "an `ANALYZER` row exists".

## `VacancyLogEntry`

Every posting seen before analysis, the dedup log —
[ADR-0026](decisions/0026-vacancy-log-table.md). Not a vacancy: most rows were
screened out on the title and never analysed, and none carries text, score or verdict.

| Field | Type | Notes |
| --- | --- | --- |
| `createdAt` | `DateTime` | When the posting was first seen (imported rows carry the file's Дата). |
| `url` | `String @unique` | **Required**, `normalizeApplyUrl`'d. An entry without an http(s) link is not checkable. |
| `company` / `title` | `String?` | Can be missing; a later duplicate that carries them fills them in. |
| `companyKey` / `titleKey` | `String?` | Match keys: lowercase, punctuation collapsed, company legal suffixes stripped. `@@index([companyKey, titleKey])`. |

Written **only** by `VacancyLogService` (`check` / `checkMany`): match by `url`, else
by the keys; a miss is recorded and reported as new, a hit is a duplicate — nothing
else is reported. Every analysed vacancy is expected to be here already: the agent
checks before it analyses, and the one-off import seeded the rest.

## Analyze-once

`save()` is: *find by `applyUrl`; if it exists, return it untouched with
`created: false`; otherwise create it with `created: true`.* The `@unique`
constraint is the real guard — a lost race on `create` (P2002) is caught and
re-resolved to `{ created: false }`.

Rationale and the HTTP consequences (POST → `201 + Location` / `200`):
[ADR-0005](decisions/0005-analyze-once.md).

> **Breaks if you change it:** switching `save()` back to an upsert →
> re-submitting a vacancy would overwrite the stored analysis; the API's
> `200`-on-existing branch and the MCP `created` flag become meaningless; the
> "second save leaves it untouched" tests fail.

## `recommendation` normalization

The analyzer emits Ukrainian wording (`ПОДАВАТИСЯ`, `ПОДАВАТИСЯ З ЗАСТЕРЕЖЕННЯМИ`,
`ПРОПУСТИТИ`). `normalizeRecommendation()` maps both the Ukrainian and the
canonical English spellings (case-insensitive, trimmed) to the English enum, and
throws `InvalidRecommendationError` (a `DomainError`) on anything else. **Storage
is always English.**

- MCP: accepts `RECOMMENDATION_INPUT_VALUES` (EN + UA) on `save`, but only English
  for the `list` filter.
- API: the `save` DTO uses `@IsIn(RECOMMENDATION_INPUT_VALUES)`; the `list` query
  DTO uses `@IsEnum(Recommendation)` (English only).

> **Breaks if you change it:** storing the raw UA string → every downstream filter
> (`@IsEnum`, the zod enums, the web `RECOMMENDATION_ORDER`) stops matching; the
> DB enum can't even hold it.

## DB-level rules (not expressible in the Prisma schema DSL)

Added by hand in `--create-only` migrations — see
[`packages/core/prisma/README.md`](../packages/core/prisma/README.md).

- **`matchScore` CHECK** (`20260909224918_add_match_score_check`):
  `CHECK ("matchScore" >= 0 AND "matchScore" <= 100)`. The app also validates
  0–100 (DTO, MCP zod), but the DB no longer trusts it to.
  > Breaks if you change it: widening the app-level bound without dropping the
  > constraint → inserts silently rejected by Postgres with a constraint error.
- **`pg_trgm` GIN index on `company`** (`20260909225003_company_trigram_index`):
  `list({ company })` filters with `contains` + `mode: 'insensitive'`, i.e.
  `ILIKE '%term%'`, which a b-tree can't serve. The extension is declared in
  `datasource.extensions = [pg_trgm]` (needs `previewFeatures =
  ["postgresqlExtensions"]`); the plain b-tree `@@index([company])` was dropped.
  > Breaks if you change it: removing `previewFeatures`/`extensions` from the
  > schema → `prisma migrate` wants to drop the extension and the GIN index;
  > company search falls back to a full scan.
- **`fullText` stays on the row** (not a 1:1 side table): Postgres TOASTs large
  `TEXT` out-of-line, and every read path except `getById` projects it out
  (`LIST_SELECT`), so queries that don't need it already don't pay for it. A side
  table would duplicate what TOAST does for free.
