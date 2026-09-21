# Domain model

Source of truth: [`packages/core/prisma/schema.prisma`](../packages/core/prisma/schema.prisma)
and [`packages/core/src/estimated-vacancy.service.ts`](../packages/core/src/estimated-vacancy.service.ts).

## `EstimatedVacancy`

One table. One row per vacancy, keyed for the outside world by `applyUrl`.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `Int` autoincrement | Primary key. Server-assigned; the URI for a row. |
| `createdAt` | `DateTime @default(now())` | When first saved. |
| `updatedAt` | `DateTime @default(now()) @updatedAt` | Bumped on any row update. In practice that means a `userAction` change — analysis fields are never updated (analyze-once). |
| `company` | `String` | |
| `title` | `String` | |
| `applyUrl` | `String @unique` | **The natural key.** The `@unique` constraint is what enforces analyze-once at the DB level. Stored **canonicalized** — `normalizeApplyUrl()` drops the query string, the fragment and a trailing slash, so the spellings one posting arrives in share one row. Exception: a domain with a site rule keeps the param that *is* the vacancy id — Indeed is stored as `<locale>.indeed.com/viewjob?jk=…`, locale and all. The raw listing URL is not kept. → [ADR-0023](decisions/0023-canonical-applyurl.md) |
| `fullText` | `String @db.Text` | The whole vacancy text. Can be large. Kept on the row, not a side table — see "fullText stays on the row" below. |
| `matchScore` | `Int` | 0–100. App-validated *and* DB-constrained — see "matchScore CHECK" below. |
| `recommendation` | `Recommendation` enum | **The analyzer's call.** `APPLY` \| `APPLY_WITH_CAVEATS` \| `SKIP`. |
| `estimationComment` | `String @db.Text` | The analyzer's reasoning. |
| `userAction` | `UserAction` enum, default `NOT_REVIEWED` | **The user's call.** `NOT_REVIEWED` \| `READY_TO_APPLY` \| `APPLIED` \| `DECLINED`. |
| `userActionUpdatedAt` | `DateTime?` | Set by `updateUserAction()` to `new Date()` each time. A *semantic* timestamp ("when I last decided something"), distinct from `updatedAt`. |

Indexes: `@@index([recommendation])`, `@@index([userAction])`, and a GIN
`gin_trgm_ops` index on `company` (see "pg_trgm index" below).

## Two independent axes: `recommendation` vs `userAction`

This is the central modelling decision. The analyzer's suggestion and the user's
decision are **different things on different axes**:

- `recommendation` — set once by `save()`, from the analyzer. Never changed
  afterwards.
- `userAction` — set only by `updateUserAction()`, from the user. Starts at
  `NOT_REVIEWED`. Never inferred from `recommendation`.

`save()` explicitly omits `userAction` from both its `create` and its (non-existent)
update path. `updateUserAction()` writes only `userAction` + `userActionUpdatedAt`.

**userAction flow** (enforced by the UI, not the DB — any transition is allowed by
the API):

```
NOT_REVIEWED ──▶ READY_TO_APPLY ──▶ APPLIED
     │                                
     └────────────────────────────▶ DECLINED
```

The web app's default filter is `NOT_REVIEWED`; the list sorts by `recommendation`
(APPLY first) then `matchScore` desc.

> **What this constrains — breaks if you change it**
> - Making `save()` write `userAction`, or `updateUserAction()` write analysis
>   fields → the analyzer would clobber the user's progress (or vice-versa). The
>   whole point of the model is that these two writers never overlap. The one
>   sanctioned crossing point is `ApplicationService.record()` setting a linked
>   vacancy's `userAction = APPLIED` — [ADR-0019](decisions/0019-record-or-create-vacancy.md).
> - Adding a `Recommendation` or `UserAction` enum value → touches: the Prisma
>   enum (migration), `RECOMMENDATION_INPUT_VALUES` + `RECOMMENDATION_ALIASES` in
>   [`recommendation.ts`](../packages/core/src/recommendation.ts), the MCP `zod`
>   enums in
   [`estimated-vacancies.schemas.ts`](../apps/mcp/src/estimated-vacancies/estimated-vacancies.schemas.ts),
   the `apps/api` DTOs
>   (`@IsIn(RECOMMENDATION_INPUT_VALUES)` on the save DTO, `@IsEnum` on the
>   list-query DTO), and the web `recommendationSchema` / `userActionSchema` +
>   `RECOMMENDATION_ORDER` + the status-filter options in `apps/web`. There is no
>   single source — see [ADR-0012](decisions/0012-web-hand-written-contract.md).
> - Adding an `ApplicationStatus` value → the Prisma enum (migration),
>   `ApplicationStatusEnum` in
   [`applications.schemas.ts`](../apps/mcp/src/applications/applications.schemas.ts), the
>   `@IsEnum(ApplicationStatus)` DTOs in `apps/api`, `applicationStatusSchema` +
>   the `APPLICATION_STATUS_LABELS` / `_ORDER` / `_BADGE_STYLES` maps in
>   [`apps/web/src/pages/applications`](../apps/web/src/pages/applications),
>   the `core` re-export, and the importer's `STATUS_ALIASES`. Same "no single
>   source" trade-off.

## `Application`

One row per submitted application (Phase 2). Deliberately minimal — it stores only
what the analyzer's row can't. See [ADR-0017](decisions/0017-application-1to1-delta.md).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `Int` autoincrement | Primary key. |
| `createdAt` / `updatedAt` | `DateTime` | Row bookkeeping. |
| `estimatedVacancyId` | `Int @unique` | **NOT NULL 1:1 FK** to `EstimatedVacancy` (`onDelete: Cascade`). |
| `appliedAt` | `DateTime @default(now())` | The real submission date — distinct from `EstimatedVacancy.createdAt` (date analysed). The tracker import backfills historical values here; the REST API has no `appliedAt` field. |
| `status` | `ApplicationStatus` enum, default `APPLIED` | `APPLIED` \| `RECRUITER_SCREEN` \| `REPLIED` \| `INTERVIEW` \| `OFFER` \| `REJECTED`. A separate axis from `UserAction` — [ADR-0018](decisions/0018-application-status-separate-enum.md). The former `NO_RESPONSE` value was dropped — [ADR-0022](decisions/0022-timeout-derived-until-scheduled.md). |
| `statusUpdatedAt` | `DateTime` **NOT NULL** | "When I last moved this in the pipeline". `record()` stamps it to `appliedAt` — a fresh application has already moved once, into the pipeline — and `updateStatus()` restamps it to `new Date()`. Never null: the column has no default, so Prisma makes it *required* in `create`, and a new creation path that forgets it fails to compile rather than silently writing null. (Unlike `EstimatedVacancy.userActionUpdatedAt`, which is still nullable.) |
| `statusComment` | `String? @db.Text` | Accumulated pipeline notes. Each `updateStatus()` call with a comment **appends** it to the existing value joined by `" / "` — not a history table, not an overwrite. Write-only via MCP (`update_application_status`) / API (`PATCH …/status`); the web `/tracker` page renders it merged with `userComment` and `estimationComment` but never writes it. Deliberately the simplest thing that works — revisit as a real history table if per-entry timestamps/authors are ever needed. |
| `salaryInListing` | `String?` | Free text ("130 PLN/h"). |
| `usedTailoredResume` | `Boolean @default(false)` | |
| `userComment` | `String? @db.Text` | The user's own note about this application. |

Indexes: `@@index([status])`, `@@index([appliedAt])`. Search on `/tracker` hits the
linked vacancy's `company` / `title` — both have trigram GIN indexes.

**Active / Timeout are derived, not stored.** `/tracker` splits the log on the client
from `statusUpdatedAt`: `REJECTED` and `OFFER` are *closed*; of the rest, anything not
moved for more than 30 days is a *timeout*, and the remainder is *active*. So
`total = active + timeout + rejected + offer`, with no overlap and no remainder. There
is deliberately no column, no job, and no server-side filter for it — the rule lives in
one place, `apps/web/src/pages/applications/constants.ts`. Don't go looking for a
`timeout` field.

`/tracker`'s status filter therefore carries three values that are **not** stored
statuses — `ALL`, `ACTIVE`, `TIMEOUT` (`STATUS_FILTER_*` in
`apps/web/src/pages/applications/types.ts`). `matchesFilter` answers all three from
the rule above, and none of them ever crosses the wire.
[ADR-0022](decisions/0022-timeout-derived-until-scheduled.md) owns the rule.

**Record-or-link** (`ApplicationService.record`, one transaction): link by
`estimatedVacancyId` (web), or by a unique case-insensitive `(company, title)`
match (MCP / import); zero matches → **create** a placeholder `EstimatedVacancy`
(`fullText:'N/A'`, `matchScore` from the tracker text or `0`, `recommendation`
derived, `estimationComment` from notes or `'N/A'`, `userAction:'APPLIED'`); more
than one → `AmbiguousVacancyMatchError`. Linking to a vacancy whose `userAction`
isn't `APPLIED` flips it to `APPLIED`. A second application for the same vacancy →
`ApplicationAlreadyExistsError`. Full rationale:
[ADR-0019](decisions/0019-record-or-create-vacancy.md).

**Update by (company, title)** (`ApplicationService.updateStatusByVacancy`): for a caller
that has no `Application` id — e.g. an agent reading a rejection/offer email — the same
case-insensitive `(company, title)` match resolves the vacancy, then its 1:1 back-relation
resolves the `Application`. Unlike `record`, this path **never creates** anything: no
match, or a matched vacancy with no recorded application yet, both return `null` (call
`record_application` first); 2+ matches still throw `AmbiguousVacancyMatchError`.

> **What this constrains — breaks if you change it**
> - Dropping `@unique` on `estimatedVacancyId` → the `ApplicationAlreadyExistsError`
>   guard and the flatten-a-1:1-join assumption in `ApplicationListItem` are gone.
> - Removing the `userAction = APPLIED` side-effect → the `/vacancies` page and the
>   `save`-then-`record` MCP spec stop seeing applied vacancies as applied.
> - Adding a field the `/tracker` page needs from the vacancy → `VACANCY_SELECT` +
>   `flatten()` in `application.service.ts` **and** `applicationListItemSchema` in
>   the web contract (parallel maintenance — [ADR-0012](decisions/0012-web-hand-written-contract.md)).

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
