# Phase 3.1: one vacancy table, one status, a journal and comments beside it

## Goal

The state of one vacancy lives in one row; what happened to it lives in two journals.
[ADR-0029](../decisions/0029-one-vacancy-table.md) holds the why.

- **`Vacancy`** (was `EstimatedVacancy`). It holds:
  - the analyzer's fields, written once;
  - `status`, `statusChangedAt`, `salaryInListing`, `usedTailoredResume`.

  `Application` merges into it.
- **`StatusChange`**: one row per status change, with its date.
- **`Comment`**: every note, with a `source` of `ANALYZER | USER | AGENT`. Append-only.
- **One modal.** Edit on `/applications` changes salary / CV and adds a comment. The
  separate comment dialog goes.
- **Renames:**
  - `/tracker` → `/applications`;
  - REST `/estimated-vacancies` → `/vacancies` and `/vacancy-log` → `/log`;
  - MCP tools drop `estimated`;
  - `EstimatedVacancy` → `Vacancy` in the schema and code.
- **Dead code goes**, and a replaced ADR is now deleted rather than kept as "superseded"
  ([`docs/README.md`](../README.md)).

## Status lifecycle

```
               ┌─▶ SAVED_FOR_LATER ─┬─▶ APPLIED ─▶ RECRUITER_SCREEN ─▶ REPLIED ─▶ INTERVIEW ─┬─▶ OFFER
NOT_REVIEWED ──┼────────────────────┘      (any pipeline status) ────────────────────────────┴─▶ REJECTED
               └─▶ DECLINED ◀── (from SAVED_FOR_LATER too)
```

- `SAVED_FOR_LATER` replaces `READY_TO_APPLY`. It means "a bookmark: maybe later".
  Existing rows migrate.
- The pipeline is `APPLIED` … `REJECTED`. `/applications` shows only these.
- The UI limits transitions, and the API allows any, as today. A row can go back to
  `NOT_REVIEWED`.
- **Timeout** stays derived (ADR-0022): a pipeline status other than `OFFER` / `REJECTED`,
  with more than 30 days since `statusChangedAt`. The window floats: from applying while
  `APPLIED`, and from the interview after `INTERVIEW`.
- **`/applications` sorts** by `statusChangedAt desc, id desc`, so a fresh application
  comes first. A comment or an edit does not reorder.
- Every explicit status write is an event: it is journaled and moves `statusChangedAt`,
  even when the status is the same — the next interview round is `INTERVIEW` again
  (step 5; step 4 had made it a no-op).

## Target schema

```prisma
model Vacancy {
  // analyzer, written once: company, title, applyUrl @unique, fullText, matchScore, recommendation
  status             VacancyStatus @default(NOT_REVIEWED)   // cache of the latest StatusChange
  statusChangedAt    DateTime      @default(now())          // its date
  salaryInListing    String?
  usedTailoredResume Boolean       @default(false)
  comments      Comment[]
  statusChanges StatusChange[]
  @@index([status, statusChangedAt])   // + recommendation, and the company/title trigram GINs
}
model StatusChange { id, createdAt, status VacancyStatus, vacancyId → Vacancy (Cascade), @@index([vacancyId, createdAt]) }
model Comment      { id, createdAt, body @db.Text, source CommentSource, vacancyId → Vacancy (Cascade), @@index([vacancyId, createdAt]) }
enum VacancyStatus { NOT_REVIEWED SAVED_FOR_LATER DECLINED APPLIED RECRUITER_SCREEN REPLIED INTERVIEW OFFER REJECTED }
enum CommentSource { ANALYZER USER AGENT }
```

These go away:
- the `Application` model and the `UserAction` / `ApplicationStatus` enums;
- the columns `estimationComment`, `userComment`, `userActionUpdatedAt`, `appliedAt`,
  `statusUpdatedAt`.

The applied date is the `createdAt` of the latest `APPLIED` journal row.

## Out of scope

Moved to [`../backlog.md`](../backlog.md) (rows marked "phase 3.1"), with `## Later`.

## Landmines

- **The dev DB is live.** Before each `migrate:deploy` to dev, print the counts (comments
  moved, journal rows, applications merged) and wait for the user's go-ahead.
- **Container clients.** After a schema change, run
  `npm run generate -w @job-search-copilot/core` inside **each** of api / mcp / core, then
  restart api / mcp.
- **Core is consumed as `dist/`.** Build core and check its exit code before the api / mcp
  tests.
- **Hand-written migrations.** They rename and backfill. Afterwards
  `prisma migrate diff` (migrations → schema) must be empty, or the next `migrate dev`
  will want to recreate tables.
- **A backfill is only tested on real rows.** The test DB is empty, so a migration that
  passes there can still fail on dev (step 3's did). Rehearse on a copy first:
  `pg_dump` dev into a scratch DB inside the postgres container, point `DATABASE_URL` at
  it, `migrate deploy`, and check the counts and `migrate diff`. Wrap the script in
  `BEGIN; … COMMIT;`: Prisma does not, and a failure half-way leaves dev between two
  schemas.
- **Migrating on the CLI.** Use `npm run migrate:dev -w @job-search-copilot/core -- --name <n>`.
  The root script drops `--name`, and Prisma then hangs on its prompt.

## Verification

Per step: `npm test` green **in the same session** before the checkbox is ticked, plus
`npm run lint` and `npm run typecheck`. Commits only on explicit instruction. Clear the
context between steps.

## Status

- [x] **0 · Docs.** 2026-09-26. This doc, [ADR-0029](../decisions/0029-one-vacancy-table.md),
  the new ADR-deletion rule in `docs/README.md` and `decisions/README.md`.

- [x] **1 · Remove dead code** (no behaviour change). 2026-09-26. ADR-0021's index row
  stays as a one-line "deleted" gap; an ADR deleted with no successor has no
  `Replaces:` line, and `decisions/README.md` now says so.
  - **One-off scripts that have already run.** Delete:
    - `scripts/import-tracker.ts`, `scripts/backfill-applyurl.ts`,
      `scripts/import-vacancy-log.ts`;
    - `src/tracker-import.ts`, `src/applyurl-backfill.ts`, `src/vacancy-log-import.ts`,
      and their specs;
    - the `import:tracker`, `backfill:applyurl` and `import:vacancy-log` npm scripts;
    - `tsx` in core, if nothing else uses it.

    Delete ADR-0021 too. Drop the backfill / import mentions from ADR-0023, ADR-0026,
    `packages/core/README.md` and `architecture.md`.
  - **api / mcp:**
    - Drop the `export` on `envSchema` (`apps/api/src/config/env.validation.ts`),
      `RecommendationInputEnum` (`apps/mcp/src/estimated-vacancies/estimated-vacancies.schemas.ts`)
      and `VacancyLogEntryDto` (`apps/api/src/vacancy-log/dto/check-vacancy-log.dto.ts`).
    - Drop `NODE_ENV` from the env schema. It is validated but never read.
    - Fix stale comments:
      - "main.ts" → `setup-app.ts` in `domain-exception.filter.ts`, `prisma.service.ts`
        and `estimated-vacancies.e2e.spec.ts`;
      - "the T6 decision" → ADR-0005 in `estimated-vacancies.controller.ts`;
      - the history note on `pagination()` in `server.spec.ts`.
    - `docker-compose.yml`: drop the "tsx watch" comments for mcp and the unused
      `CHOKIDAR_*` env on the mcp service.
    - Move the `/health` test out of `estimated-vacancies.e2e.spec.ts` into its own
      `health.e2e.spec.ts`.
    - Declare `vite` in api / mcp devDependencies (their `vitest.config.mts` imports it)
      and `dotenv-cli` at the root (`test:db:migrate`).
  - **web** (`apps/web/src/`):
    - Delete the unused `APPLICATION_STATUS` (`pages/applications/types.ts`),
      `APPLICATION_STATUS_TAG_VARIANTS` (`pages/applications/constants.ts`, and its
      comment) and `RECOMMENDATION_LABELS` (`pages/vacancies/constants.ts`).
    - Delete the unused CSS: `.brand-sub`, `.nav-count` (4 places), `.topbar-meta` and
      `.btn-sm` in `index.css`.
    - Delete zod fields nothing reads:
      - applications: `createdAt`, `updatedAt`, `recommendation` and its private
        `recommendationSchema`, and `resolution` / `vacancyCreated` in the record
        response;
      - vacancies: `updatedAt`, `userActionUpdatedAt`;
      - `RecordApplicationInput.status`;
      - the MSW fake's `userActionUpdatedAt` write.
    - `isDark` from `useTheme()`, and the `useSyncExternalStore` behind it
      (`lib/theme.ts`). Only a test reads it. First confirm that `applyPreference` sets
      the theme class on `<html>`, not that subscription. With it go `systemPrefersDark`,
      `darkQuery` and the `matchMedia` stub in `test/setup.ts` — nothing else reads them.
    - Drop the `export` on `DashboardCounts`, `PendingVacancy` and `userActionSchema`.
    - Fix stale comments: `pages/applications/types.ts` (lines 1 and 5),
      `lib/theme.ts` (the "topbar icon" note), and the detached JSDoc at the top of
      `test/msw/handlers.ts`.
    - Kept on purpose:
      - exports used only by tests (`timeAgo`, `TIMEOUT_DAYS`, `applyPreference`);
      - the `preview` script;
      - `LogPage` / `ProfilePage`, which are planned pages.

- [x] **2 · Renames** (mechanical, end to end, same behaviour). 2026-09-26. Deployed to
  dev. Kept on purpose: the `tracker://` synthetic-URL scheme (stored data), the
  "Application tracker" page title, and core's `VacancyLogService` / MCP
  `check_vacancy_log*` (only the REST layer became `log/`). `estimatedVacancyId` →
  `vacancyId` also renamed the `POST /applications` body field. Still open, outside
  the repo: the skills' tool names and n8n's path.
  - **Prisma.** `EstimatedVacancy` → `Vacancy`, `estimatedVacancyId` → `vacancyId`.
    The migration is hand-written: `ALTER TABLE … RENAME`, plus renaming the pkey /
    unique / index / FK names so Prisma sees no drift.
  - **Core.** `EstimatedVacancyService` → `VacancyService`, in `vacancy.service.ts` /
    `vacancy.types.ts`. The types become `VacancyListItem`, `SaveVacancyInput`, …;
    update `index.ts`.
  - **REST.** `estimated-vacancies/` → `vacancies/` at `/api/v1/vacancies`, and
    `vacancy-log/` → `log/` at `/api/v1/log/check`. Rename the DTOs.
  - **MCP.**
    - `save_estimated_vacancy` → `save_vacancy`;
    - `save_estimated_vacancies_batch` → `save_vacancies_batch`;
    - `get_estimated_vacancy` → `get_vacancy`;
    - `list_estimated_vacancies` → `list_vacancies`;
    - `update_estimated_vacancy_user_action` → `update_vacancy_user_action` (merged away
      in step 4).

    The folder `estimated-vacancies/` becomes `vacancies/`.
  - **Web.** Route `/tracker` → `/applications`: the Sidebar, `useSearch({ from })`,
    `router.test.tsx`, the API paths and the MSW handlers.
  - **Tests and docs.** The e2e paths, `server.spec.ts`, `contracts.md`,
    `domain-model.md`, `architecture.md` and the invariant names in `CLAUDE.md`.
  - **Outside the repo (the user).** The `job-search-copilot-sync` and
    `vacancy-evaluator` skills get the new tool names. n8n, if it is already wired,
    moves to `/api/v1/log/check`.

- [x] **3 · Comments: one table on the vacancy, with a `source`; one modal.** 2026-09-26.
  Deployed to dev: 264 `ANALYZER`, 216 `USER`, 21 `AGENT`. Beyond the plan:
  `updateUserAction` also returns `estimationComment` (the web parses that PATCH with its
  list-item schema), so step 4's `VacancyService.updateStatus` must keep returning it.
  `MergedComment` dates every comment. The test DB recorded this migration's first,
  broken checksum (schema identical); `migrate reset` is blocked for the agent, and the
  user may run `npx dotenv -e ../../.env.test -- prisma migrate reset --force` in
  `packages/core`. Still open, outside the repo: the skills' `userComment` /
  `statusComment` → `comment`.
  - **Hand-written migration:**
    1. Create `CommentSource`. Add `Comment.vacancyId` and `source`, nullable for now.
    2. Existing rows: set `vacancyId` via `Application`, and `source = 'AGENT'` (they were
       status notes).
    3. Turn `userComment` into `USER` rows, `createdAt = appliedAt`.
    4. Turn `estimationComment <> 'N/A'` into `ANALYZER` rows,
       `createdAt = Vacancy.createdAt`.
    5. Set NOT NULL and add the index. Drop `applicationId`, `userComment` and
       `estimationComment`.
  - **Core, `VacancyService`:**
    - `save()` writes the `ANALYZER` row as a nested create. A repeat save writes
      nothing (analyze-once).
    - `list` / `getById` return `estimationComment: string | null`, derived from the first
      `ANALYZER` row.
    - `hasAnalysis` = "an `ANALYZER` row exists". Rewrite the ceiling note on
      `VacancyListItem`.
  - **Core, `ApplicationService`:**
    - `record()`: `comment?` → `USER`; `estimationComment?` (placeholder path) →
      `ANALYZER`.
    - `updateStatus(id, status, note?, source)`: MCP passes `AGENT`, REST passes `USER`.
    - `update(id, { salaryInListing?, usedTailoredResume?, comment? })`: a non-blank
      `comment` adds a `USER` row.
    - `addComment` goes.
    - `ApplicationListItem.comments` becomes `{ id, createdAt, body, source }[]`, oldest
      first, `ANALYZER` included. `userComment` and `estimationComment` leave it.
  - `PLACEHOLDER_COMMENT` stays, for `fullText`.
  - **REST.** Delete `POST /applications/:id/comments` and `add-comment.dto.ts`.
    `userComment` → `comment` on the record / update DTOs.
  - **MCP.** `userComment` → `comment` on `record_application`, and `statusComment` →
    `comment`. Update the descriptions.
  - **Web:**
    - `ApplyDialog` in edit mode has an empty "Add a comment" field beside salary and CV.
    - Delete `CommentDialog`, the Comment button, the `addComment` mutation and its API
      function.
    - The Action column becomes `Copy · Edit`; re-measure its width in a browser.
    - `MergedComment` renders `comments` in time order, with the class taken from
      `source`.
    - Update the types and the MSW fakes. `VacancyTable` shows `null` as "—".
  - Delete ADR-0028.
  - **Tests:**
    - core: each source; the repeat save; `update` with and without a comment;
    - e2e and `server.spec.ts`;
    - `MergedComment`, `useApplications`, `useVacancies`, and `ApplyDialog` in edit
      mode.

- [x] **4 · One status + `StatusChange`; `Application` merges into `Vacancy`** (end to
  end). 2026-09-26. Deployed to dev: 0 mismatches against the old status / salary /
  CV / `appliedAt` (rehearsed on a copy twice). Many applications predated their placeholder's `createdAt`, so the backfill dates
  `NOT_REVIEWED` at `LEAST(createdAt, appliedAt)`. A pre-deploy dump is in the postgres
  container at `/tmp/jsc_before_step4.dump` (gone with the container). Beyond the plan:
  `record` journals `APPLIED` first, then a given pipeline `status`, so `appliedAt`
  survives; `appliedAt` is `null` for a row set straight past `APPLIED`; a new vacancy's
  first row is dated explicitly (`firstStatus`); `update_vacancy_status` lives in
  `applications.tools.ts` and returns `{ success, vacancy }`; the stale present-tense
  mentions in ADR-0002/0005/0011/0012/0024/0025/0026 were fixed too. Still open,
  outside the repo: the skills (below).
  - **Hand-written migration.** Dry-run with counts on dev before deploying.
    1. Create `VacancyStatus`. Add `status`, `statusChangedAt`, `salaryInListing` and
       `usedTailoredResume` to `Vacancy`. Create `StatusChange` and its index.
    2. Backfill the journal:
       - `NOT_REVIEWED` at `Vacancy.createdAt`, for every vacancy;
       - the `userAction` (`READY_TO_APPLY` → `SAVED_FOR_LATER`) at
         `coalesce(userActionUpdatedAt, updatedAt)`, where it is not `NOT_REVIEWED` and
         no application covers it;
       - `APPLIED` at `appliedAt`, for every application;
       - the current `Application.status` at `statusUpdatedAt`, where it is not
         `APPLIED`.
    3. Set `status` / `statusChangedAt` from the latest journal row, and copy salary / CV
       from `Application`.
    4. Drop `Application`, `userAction`, `userActionUpdatedAt`, the `UserAction` and
       `ApplicationStatus` enums, and the `userAction` index.
    5. Check that `prisma migrate diff` is empty.
  - **Core.** Two services over the same `Vacancy` rows. They are two views, not two
    status zones: applying changes `status`, and the row does not move.
    - `status.ts`:
      - `PIPELINE_STATUSES`;
      - `writeStatus(db, vacancyId, status, at = now)`. If the status differs, it updates
        `status` + `statusChangedAt` and creates the `StatusChange` in the same
        transaction; if not, it does nothing. It is the only writer of status.
    - `VacancyService` (the `/vacancies` page and the analyzer; sees every vacancy):
      - `save` creates the vacancy with a `NOT_REVIEWED` journal row and the `ANALYZER`
        comment;
      - `saveMany` is unchanged;
      - `getById` adds `comments`;
      - `list` takes `status?: VacancyStatus[]` (`in`) in place of `userAction`;
      - `updateStatus(id, status)` replaces `updateUserAction` and goes through
        `writeStatus`.
    - `ApplicationService` (the `/applications` page; pipeline statuses only):
      - **select.** The vacancy fields + `comments` + the latest `APPLIED` journal row →
        `appliedAt`.
      - **`record`,** in one transaction:
        1. find the vacancy by `vacancyId` or by `(company, title)`, else create a
           placeholder;
        2. if it is already in the pipeline, throw `AlreadyAppliedError` (was
           `ApplicationAlreadyExistsError`);
        3. `writeStatus(APPLIED)`, then `writeStatus(input.status)` if given (a no-op for
           `APPLIED`), set salary / CV, and write `comment` as a `USER` row.

        The `appliedAt` input goes; only the importer used it.
      - **`recordMany`** stays (transactional) for `record_applications_batch`.
      - **`getById`:** `findFirst where { id, status in PIPELINE }`.
      - **`list`:** `status in (filters.status ? [it] : PIPELINE)` + search, ordered by
        `[statusChangedAt desc, id desc]`, with `count` over the same `where`.
      - **`updateStatus(id, status, note?, source)`** and `updateStatusByVacancy`. The
        "must already have an application" rule goes for `updateStatus` (by id);
        `updateStatusByVacancy` matches only vacancies already in the pipeline, so an
        email about one never applied to is "not found" → need-attention.
      - **`update(id, { salaryInListing?, usedTailoredResume?, comment? })`.**
    - `ApplicationListItem`: `id` (the vacancy's), `status`, `statusChangedAt`,
      `appliedAt` (derived; `null` without an `APPLIED` row), `salaryInListing`, `usedTailoredResume`, `comments`,
      `company`, `title`, `applyUrl`, `matchScore`, `recommendation`.
    - `index.ts` exports `VacancyStatus`, `CommentSource` and `PIPELINE_STATUSES`; drops
      `Application`, `UserAction` and `ApplicationStatus`.
  - **REST:**
    - `GET /vacancies?status=A,B` (the DTO splits the list and checks each value);
    - `PATCH /vacancies/:id/status { status }` in place of `/user-action`;
    - `POST /applications { vacancyId, salaryInListing?, usedTailoredResume?, comment?,
      status? }`;
    - `GET /applications`, `GET /applications/:id`;
    - `PATCH /applications/:id/status { status, comment? }`, `PATCH /applications/:id`.
  - **MCP** (10 tools):
    - `update_vacancy_status { id? | company+title, status, comment? }` replaces both
      status tools; its source is `AGENT`; it returns `{ success, vacancy: { id,
      company, title } }`;
    - `list_vacancies { status?: [] }`;
    - `record_application`, `record_applications_batch` and `list_applications` follow
      the new fields.
  - **Web:**
    - One `vacancyStatusSchema`.
    - The `/vacancies` filter: Not reviewed, Saved for later, Declined, Applied (all
      pipeline statuses) and All.
    - The row actions stay as they are: the Apply and Decline buttons, and in the ⋯ menu
      "Not reviewed" and "Saved for later". A pipeline row's tag shows its real status,
      and its Apply, Decline and ⋯ are disabled: once applied, the status moves on
      `/applications` only.
    - `/applications` types: `status` is the pipeline subset, plus `statusChangedAt` and
      `appliedAt`.
    - `isTimedOut` reads `statusChangedAt`, and the KPI tiles stay.
    - The dashboard counts by `status=`.
    - `useApplications` sets `statusChangedAt` optimistically and re-sorts.
    - Rewrite the MSW handlers for one table.
  - **Docs:**
    - rewrite `domain-model.md`; update `contracts.md`;
    - invariants in `architecture.md` and `CLAUDE.md`: 3 becomes "`recommendation` is the
      analyzer's; `status` is the user's", and 9 goes;
    - update ADR-0019 and ADR-0022 in place, and delete ADR-0017 and ADR-0018.
  - **Tests:**
    - core:
      - each path writes exactly one journal row and keeps the cache in step;
      - the same status writes none;
      - `appliedAt` comes from the journal;
      - `/applications` sorts by `statusChangedAt`;
      - `AlreadyAppliedError`;
      - `list` accepts several statuses;
    - e2e and `server.spec.ts`;
    - web: the filters, timeout from the last move, and the order after applying.
  - **Outside the repo (the user).** The skills move to `update_vacancy_status` and
    `SAVED_FOR_LATER`, and `list_applications`' `id` is now the vacancy's id.

- [x] **5 · Status writes as events; matching an email to its application** (end to
  end). 2026-09-27. No migration. Known, not fixed: the full `npm test` fails now and then
  on a timeout under load (an api e2e `beforeAll`, a web `findBy*` at 5 s) and passes on
  a rerun — worth its own look before the suite is trusted in CI. Why: several interview rounds were invisible (a same status was a no-op), and
  the email sync had no reliable way to pick one of several applications at a company.
  - **Core:**
    - `writeStatus` loses its `status <> new` guard: every call journals and moves
      `statusChangedAt`. `record` writes `input.status` only when it is not `APPLIED`.
    - `list` (vacancies) and `list` (applications) take `applyUrl?`, normalized as
      `save` does (`normalizeApplyUrl`, raw when unusable, so `tracker://` still matches),
      compared exactly.
  - **MCP:**
    - `record_application` / `record_applications_batch` take `vacancyId?` as an
      alternative to `company`+`title` — exactly one of the two;
    - `list_vacancies` / `list_applications` take `applyUrl?`;
    - `update_vacancy_status` and `SERVER_INSTRUCTIONS`: every call is an event — call
      it once per real event.
  - **Web:** picking the status a row already has on `/vacancies` sends nothing; the
    `/applications` optimistic write always stamps `statusChangedAt`; the MSW fake
    follows.
  - **Docs:** `domain-model.md`, `contracts.md`, ADR-0029.
  - **Skills:** `applied-vacancies-tracker` matches an email by the link in it, then the
    one application at the company, then an unambiguous title, else
    `need-attention-tracker`; an invitation, a reschedule or a recruiter's answer sends
    the status even when it is the same, a reminder or an auto-confirmation does not;
    a manual pick records by `vacancyId`.
  - **Tests:** core — a same status journals and moves the date, `record` with
    `status: APPLIED` writes one row, `applyUrl` on both lists; MCP — `vacancyId` on
    record, neither id nor company+title, `applyUrl`; web — the `/vacancies` same-status
    pick sends nothing.

## Later

Moved to [`../backlog.md`](../backlog.md).
