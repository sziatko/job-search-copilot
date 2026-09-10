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
| `applyUrl` | `String @unique` | **The natural key.** The `@unique` constraint is what enforces analyze-once at the DB level. |
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
>   whole point of the model is that these two writers never overlap.
> - Adding a `Recommendation` or `UserAction` enum value → touches: the Prisma
>   enum (migration), `RECOMMENDATION_INPUT_VALUES` + `RECOMMENDATION_ALIASES` in
>   [`recommendation.ts`](../packages/core/src/recommendation.ts), the MCP `zod`
>   enums in [`server.ts`](../apps/mcp/src/server.ts), the DTO `@IsEnum` in
>   `apps/api`, and the web `recommendationSchema` / `userActionSchema` +
>   `RECOMMENDATION_ORDER` + the status-filter options in `apps/web`. There is no
>   single source — see [ADR-0012](decisions/0012-web-hand-written-contract.md).

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
