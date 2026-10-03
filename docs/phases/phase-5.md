# Phase 5: unscored vacancies in one table — intake for n8n, analysis over MCP

## Goal

The end goal: several vacancy sources (justjoin.it, nofluffjobs, LinkedIn, pracuj.pl,
Indeed, recommendation emails) are collected **mechanically, with no AI**, by n8n
into JSC. Later an agent (Claude Desktop over MCP) pulls the unscored ones, reads each
posting once and sends back only the verdict — today `save_vacancy` takes `fullText`
as tool input, so the text passes through the agent twice. From the verdict on, the
existing flow runs unchanged (triage → pipeline).

That goal is three sub-projects; **this phase is the first**:

1. **JSC takes unscored vacancies** — the model, an intake endpoint for n8n, MCP tools
   to pull the queue and submit analyses, an `/inbox` page. This phase.
2. **n8n collectors** — one workflow per source, writing to step 4's endpoint. Backlog.
3. **AI scoring and the email flow in n8n** — a cloud model in a separate, parallel n8n
   flow that writes analyses through step 3's REST endpoint; the email-driven status
   updates move there too. Backlog; to be designed later.

Also in this phase, unrelated but asked for on 2026-10-03: `salaryInListing` is renamed
`salaryInApplication` — it holds what the user entered when applying, not the
listing's figure.

Decided with the user on 2026-10-02/03:

- **The vacancy log merges into `Vacancy`.** The analysis fields become nullable;
  `null` = not analysed yet. ADR-0026 rejected exactly this; its two reasons are
  answered: analyze-once becomes "the analysis is written once" (a conditional write,
  not `@unique`), and unscored rows never reach `/vacancies` because they carry their
  own statuses. A new ADR-0033 supersedes ADR-0026 and amends ADR-0005.
- **Two new triage statuses, `NEW` and `FILTERED_OUT`.**
  - `NEW` is the analysis queue. Its only exits: an analysis (`SKIP` → `FILTERED_OUT`,
    otherwise → `NOT_REVIEWED`), or the user's manual `FILTERED_OUT`. **Not `DECLINED`**:
    that stays "I read the analysis and chose not to apply".
  - `FILTERED_OUT → NEW` ("back to the queue") only while there is no analysis.
  - The rule is enforced by the UI, like the rest of the lifecycle — except
    "an analysed row is never `NEW`", which is a DB CHECK.
  - **An explicit exception to invariant 3:** the analyzer moves a status in exactly
    one case — out of `NEW`, in the same transaction that writes the analysis, by the
    rule above. The rule lives in `core`, never in an agent. It cannot clobber the
    user's progress: it only fires from `NEW`.
  - **Every vacancy's journal starts with `NEW`** — its date is the date the vacancy
    came in, on every path (intake, `save_vacancy`, `record_application`'s placeholder).
    `save_vacancy` writes `NEW`, then the rule's status, in one transaction.
- **n8n writes only what passed its own keyword filter.** A keyword rule costs nothing
  to re-run on the same posting, so nothing filtered out is stored. n8n's order:
  list → filter on the title → intake without text → fetch text **only for the new
  ones** → intake again with text (a match fills the missing text).
- **A vacancy without text** never enters the queue; it waits on `/inbox`'s No text
  tab until a later intake fills it. n8n fetches LinkedIn text through the guest
  link, as the skills do today.
- **`get_vacancies_batch` and `submit_analyses_batch`, ≤ 10 each.** Each tool call is
  a model step that re-reads the conversation: 50 single calls are 50 steps, batches
  of 10 are 5. The cap also keeps the agent from loading 50 postings at once.
- **Per-page status contexts.** `ALL` in a page's status filter means that page's
  statuses, never the whole table. Search moves from the toolbar into a modal that
  shows its results inside itself, like the company modal.
- **Multi-user is a future idea**, not this phase: each user has their own vacancies
  (their own filters), so a `userId` column and `@@unique([userId, applyUrl])`.
  Nothing here blocks it.

Out of scope, kept in the backlog: the n8n workflows, AI scoring in n8n, multi-user,
auth, per-column filters, `source` on `StatusChange`.

### Dev DB, 2026-10-03 (read-only)

Log: 1421 rows; 541 also in `Vacancy`; ~880 only in the log; 12 without company or
title. `Vacancy`: 605 rows, 201 placeholders (`fullText = 'N/A'`). The analyzer writes
to the dev DB, so recount before migrating.

## The model (step 2)

- `Vacancy.fullText`, `matchScore`, `recommendation` → nullable.
- New: `companyKey String?`, `titleKey String?` (`@@index([companyKey, titleKey])`, from
  `normalizeCompanyKey` / `normalizeTitleKey`, now in `packages/core/src/vacancy-intake.ts`),
  and `source String?` (`justjoin`, `linkedin`, …; free text, not an enum, so a new n8n
  source needs no migration; `null` on old and manual rows). The keys are **nullable**:
  a name that normalizes to nothing (`—`) has no key, so NOT NULL cannot hold. Every
  create path computes them (intake, `save()`, `record()`'s placeholder).
- Hand-written CHECKs (see `packages/core/prisma/README.md`):
  - `Vacancy_analysis_both_or_neither`: `("matchScore" IS NULL) = ("recommendation" IS NULL)`;
  - `Vacancy_new_is_unanalysed`: `"status" <> 'NEW' OR "recommendation" IS NULL`.
  Neither is deferrable, so a writer creates the row unanalysed (`NEW`), moves it out of
  `NEW`, then writes the analysis — `save()` and the placeholder both do.
- `VacancyStatus`: `ADD VALUE 'NEW' BEFORE 'NOT_REVIEWED'`, `ADD VALUE 'FILTERED_OUT'
  AFTER 'UNAVAILABLE'`; both in `TRIAGE_STATUSES` (`packages/core/src/status.ts`).
  **Gotcha:** Postgres cannot use an enum value in the transaction that added it — the
  `ADD VALUE`s go in their own migration, before the data migration.
- The column default and `firstStatus` → `NEW`. The rule is `statusAfterAnalysis` in
  `status.ts`.
- `hasAnalysis` = `recommendation IS NOT NULL` (was: an `ANALYZER` comment exists).
- `record_application`'s placeholder: `fullText` `null`, not `'N/A'` (`placeholder.ts` is
  gone); no analysis unless the caller passed a `matchScore` (then `recommendation` is
  the caller's or derived, as today — the CHECK wants both or neither), written after
  `APPLIED` has moved the row out of `NEW`.
- **Migrations, hand-written** (`migrate dev` targets the dev DB):
  `20261003130000_new_and_filtered_out_status` (the `ADD VALUE`s alone), then
  `20261003130100_vacancy_log_into_vacancy`, **one transaction:**
  - a log row with no `Vacancy` → a `Vacancy` with status `FILTERED_OUT`, no analysis,
    no text, `createdAt` = the log's; journal `NEW` then `FILTERED_OUT`, both dated
    the log's `createdAt` (`id` orders them). The agent screened these out once; kept
    so that a posting n8n's rule lets through is not analysed again.
  - a log row with a `Vacancy` (matched on `url = applyUrl`) → `createdAt` = the
    earlier of the two, and the log's keys.
  - a missing company or title → `'—'`, so url dedup still finds the row.
  - a placeholder (`fullText = 'N/A'`) with no `ANALYZER` comment → `matchScore`,
    `recommendation` = `null`. Its `0` / `APPLY` was never an analysis, and `APPLY`
    sorted it up in `sort=recommended`. Its status is in the pipeline, so it never
    enters the queue; step 3's `submitAnalysis` can score it later. Every `'N/A'`
    `fullText` → `null`, the one placeholder with an `ANALYZER` comment included.
  - every existing vacancy gets a `NEW` row first in its journal, dated
    `LEAST(the log's createdAt, createdAt − 1 ms, its first row − 1 ms)` — on the dev DB
    4 log rows are later than the vacancy's first journal row, and a `NEW` dated after
    it would not be first.
  - the keys of rows with no log row: the one-off script
    `packages/core/scripts/backfill-match-keys.ts` (`npm run backfill:match-keys -w
    @job-search-copilot/core [-- --commit]`, dry run by default, one transaction on
    `--commit`, fills only a null key), run after the migration.
  - `DROP TABLE "VacancyLogEntry"`.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`; the backlog rows it takes
  marked `planned (phase 5)`; new rows for sub-projects 2 and 3 and multi-user. —
  *2026-10-03.* Docs only; `npm test` 430/430 on the same code (main after 4.3).

- [x] **1 · Rename `salaryInListing` → `salaryInApplication`.** No behaviour change.
  — *2026-10-03.* `npm test` 430/430. Migration `20261003120000_rename_salary_in_application`
  is on the test DB only: the **dev DB is not migrated** and waits for the user's
  go-ahead (`npm run migrate:deploy -w @job-search-copilot/core`, then `docker compose
  restart api mcp core`, then check a salary survived). Until then a `migrate dev` on
  the dev DB (step 2's `--create-only`) meets it as pending. The skill is not
  re-uploaded yet.
  - A hand-written migration (not `migrate dev --create-only`, which targets the dev
    DB): `ALTER TABLE "Vacancy" RENAME COLUMN "salaryInListing" TO
    "salaryInApplication"` — Prisma's diff for a renamed field is `DROP` + `ADD`, which
    loses the data. A bare `RENAME` breaks `prisma/README.md` rule 3 (expand → backfill
    → contract) on purpose: api, mcp and web run on one machine and restart together,
    so no reader of the old name outlives the migration.
  - Every use: `packages/core` (`schema.prisma`, `application.types.ts`,
    `application.service.ts` and their specs), `apps/api` (`record-application.dto.ts`,
    `update-application.dto.ts`, `test/applications.e2e.spec.ts`), `apps/mcp`
    (`applications.schemas.ts`, tool descriptions, `server.spec.ts`), `apps/web`
    (`applications/types.ts`, `vacancies/types.ts`, the hooks, `VacancyPage`,
    `ApplicationsPage`, `ApplicationsTable`, MSW handlers, tests). `grep -r
    salaryInListing` over `apps packages skills` ends empty. Old migrations, phase docs,
    ADRs and `docs/design/` keep the old name — they are history.
  - `skills/application-status-tracker/SKILL.md` — the user re-uploads it after.
  - `docs/contracts.md`, `docs/domain-model.md`.
  - The backlog row moves to `backlog-archive.md`.
  - The dev DB migrates only on the user's go-ahead; check a salary value survives.

- [x] **2 · Core: the model, the migration, intake on `Vacancy`.** — *2026-10-03.*
  `npm test` 437/437 (core 223, api 46, mcp 31, web 137). Migrations
  `20261003130000_new_and_filtered_out_status` + `20261003130100_vacancy_log_into_vacancy`
  are on the test DB only. **The dev DB still needs**, on the user's go-ahead and in this
  order: `npm run migrate:deploy -w @job-search-copilot/core` (step 1's and these two),
  `npm run backfill:match-keys -w @job-search-copilot/core -- --commit`, then `docker
  compose restart api mcp core`. **Not before step 3 (better step 4) is in:** until then
  `check_vacancy_log` → `save_vacancy` drops the analysis (the check creates the row,
  and attaching to an unscored row is step 3), and the skill's url-only batch checks are
  skipped (company and title are required now). For step 4: a link pasted alone has no
  company/title before the fetch, and intake needs both — the skill's manual flow has to
  fetch first. `record_application` by `(company, title)` now sees the 880 migrated rows
  too: duplicate case-insensitive name groups go from 15 to 26 on the dev data, so more
  `AmbiguousVacancyMatchError`s (answered by `vacancyId`).
  - The schema and migrations in "The model" above.
  - `VacancyLogService` → `VacancyIntakeService` (`vacancy-intake.service.ts`,
    `intake` / `intakeMany`; `InvalidVacancyLogEntryError` → `InvalidIntakeEntryError`):
    `prepare` / `recordOne` move to `Vacancy`. Match by `applyUrl`, else by
    `(companyKey, titleKey)`, oldest row. A miss creates the `Vacancy` (status `NEW`
    through `firstStatus`) with `source` and `fullText` when given. A hit
    fills `fullText` when the row has none and the entry has some; nothing else on a
    hit, ever (not status, source or analysis). Returns `{ new }` as today. Company and
    title are required now (`Vacancy` needs them): an entry without them is skipped
    like a url-less one.
  - Its `list` stays for now, over `Vacancy`, so the web `/log` page keeps working until
    step 5. `POST /log/check` and the MCP `check_vacancy_log*` keep their names and
    shapes until step 4.
  - `VacancyService.save()` creates with the journal `NEW` → the rule's status
    (`SKIP` → `FILTERED_OUT`, else `NOT_REVIEWED`). Attaching to an unscored row is
    step 3.
  - `/stats`: `logged` = `vacancy.count()`.
  - `sort=recommended`: `NULL` recommendations sort last (Postgres' default for `asc`;
    test it). Prisma 7 pages a nullable `orderBy` in memory from the cursor row and
    returns nothing once that row has left the filter, so `list` keeps the cursor row in
    its `where` (`OR id = cursor`) and `toCursorPage` drops it.
  - Web contract (invariant 5): `matchScore`, `recommendation`, `fullText` nullable;
    `NEW`, `FILTERED_OUT` in `vacancyStatusSchema`, `STATUS_LABELS`, `STATUS_TAGS`;
    a `null` score draws `—`. The full "Adding a `VacancyStatus` value" list in
    `domain-model.md` applies — but no row buttons for them yet (step 5), and the MCP
    descriptions and `SERVER_INSTRUCTIONS` are step 3's. `FILTERED_OUT` is in
    `VacancyPage`'s `CLOSED_BAD`.
  - ADR-0033 (supersedes 0026, amends 0005); invariants 2 and 3 in
    `architecture.md` § System invariants and in `CLAUDE.md`; `domain-model.md`
    (`Vacancy`, the lifecycle diagram, `VacancyLogEntry` section removed).
  - Verify the migration on a restored `pg_dump` of the dev DB in a scratch database:
    every log url is a `Vacancy`, the placeholders have no analysis, every journal's
    first row is `NEW`, row counts add up. The dev DB itself migrates only on the
    user's go-ahead.

- [x] **3 · Analysis: core, REST, MCP, the skill.** REST is there for sub-project 3's
  n8n flow, MCP for the agent. — *2026-10-03.* `npm test` 458/458 (core 233, api 53,
  mcp 35, web 137). No migration. `save_vacancy` after `check_vacancy_log` now attaches
  the analysis, so step 2's dev-DB blocker on that count is gone (the url-only batch
  checks still wait for step 4). The user re-uploads `vacancy-evaluator` (queue mode)
  after the dev DB is migrated and `docker compose restart api mcp core` has loaded the
  three new tools. For step 5: `PATCH …/status` to `NEW` on an analysed row is a 500
  (the CHECK, not a `DomainError`) — offer Back to queue only without an analysis; the
  MSW fake derives `hasText` per item but has no `?hasText=` filter yet.
  - `core`: `submitAnalysis({ id, matchScore, recommendation, estimationComment })`
    and `submitAnalyses` (one transaction; the ≤ 10 cap, `ANALYSIS_BATCH_MAX`, is the
    transports'). One function, `writeAnalysis`, writes every analysis on `Vacancy`
    (`save()`'s too): a conditional write (`WHERE recommendation IS NULL`) first, which
    takes the row lock, then from `NEW` the rule's status through `writeStatus`, then
    the analysis and the `ANALYZER` comment, all in one transaction. Already analysed →
    `AlreadyAnalysedError`, unknown id → `VacancyNotFoundError` (both `DomainError`s).
    Any other status (a pipeline placeholder) → the analysis is written, the status
    untouched.
  - `save()` on an existing unscored row attaches the analysis (and `fullText` if the
    row has none) through the same code — `{ created: false, attached: true }`, MCP
    `success: true`, REST `200`; on an analysed row it is untouched, as today.
  - `list` (`VacancyService`): a `hasText` filter, and `hasText` on each item.
  - REST: `POST /vacancies/:id/analysis`, `POST /vacancies/analysis` (batch);
    `AlreadyAnalysedError` → 409, `VacancyNotFoundError` → 404 (`DomainExceptionFilter`'s
    `STATUS_OF`). `hasText` on the list query DTO.
  - MCP: `submit_analysis`, `submit_analyses_batch`, `get_vacancies_batch` (≤ 10, with
    `fullText`), `hasText` on `list_vacancies`. Tool descriptions and
    `SERVER_INSTRUCTIONS` gain `NEW` / `FILTERED_OUT` and the rule.
  - `skills/vacancy-evaluator/SKILL.md`: a "work the queue" mode —
    `list_vacancies({ status: ['NEW'], hasText: true })` → `get_vacancies_batch` →
    score → `submit_analyses_batch`. `skills/README.md`. The user re-uploads after.
  - `docs/contracts.md`.

- [x] **4 · Intake: REST and MCP.** — *2026-10-03.* `npm test` 463/463 (core 233, api 57,
  mcp 36, web 137). No migration. **Dev DB migrated 2026-10-03 after this step**
  (backup `pg_dump` first; steps 1–2 migrations; backfill 64 keys, 12 `— / —` left
  null; 1485 vacancies, 880 `FILTERED_OUT`, every journal starts `NEW`, 118 salaries
  kept). Decided then: in the manual flow a SKIP / <50% verdict goes back through
  `submit_analysis` without text (id from `list_vacancies({ applyUrl })`), so the row
  leaves `NEW` and is never analysed twice. The url-only batch checks are gone, so step 2's dev-DB
  blocker is cleared: the dev DB can migrate (step 2's order), then `docker compose
  restart api mcp core`. The user then re-uploads `vacancy-evaluator` once — it carries
  step 3's queue mode and this step's intake flow; until then the old skill calls
  `check_vacancy_log*`, which no longer exist. The end-to-end check under Verification
  was not run (it needs the migrated dev DB). For step 5: `LogModule` still provides its
  own `VacancyIntakeService` for `GET /log`; it goes with the module.
  - `POST /vacancies/intake`: `{ entries: [{ url, company, title, source?, fullText? }] }`,
    `@IsUrl` on `url` (http(s), scheme required — core's rule), company and title not
    blank, ≤ 100 entries, → `200 { new: [url as sent] }`. The JSON body limit goes to
    5 MB in `configureApp` (`apps/api/src/setup-app.ts`, not `main.ts`, so the e2e suite
    runs it too; Express' default is 100 KB; 100 postings with text are ~0.5–1 MB).
  - `POST /log/check` goes.
  - MCP: `check_vacancy_log` / `check_vacancy_log_batch` → `intake_vacancy` /
    `intake_vacancies_batch` (+ optional `source`; no `fullText` over MCP). The rename is
    honest: the tool now creates a vacancy in `NEW`, not a log row. `url`
    (`z.httpUrl()`), `company` and `title` (non-blank) are **required** in the zod
    schema (since step 2 core skips an entry without them, which a caller would read as
    "duplicate" — a validation error is honest). The file moved to
    `apps/mcp/src/intake/intake.tools.ts`.
  - `vacancy-evaluator`: the manual flow (a link pasted alone has no company or title
    until its page is fetched — decided 2026-10-03): `list_vacancies({ applyUrl })`
    (a url-only check, before spending a fetch) → found: duplicate, stop → else fetch
    the page → `intake_vacancy` with company and title (catches the same role under a
    new link) → `new: false`: duplicate, stop → analyse → `save_vacancy` (step 3
    attaches the analysis to the `NEW` row). Batch checks from a list that has company
    and title use `intake_vacancies_batch` directly. `skills/README.md`. The user
    re-uploads after.
  - No auth: n8n runs in the same local Docker stack. Nothing goes to the cloud before
    the auth backlog row.
  - Closes the backlog row "`applyUrl` not URL-validated at the API": the same `@IsUrl` on
    `SaveVacancyDto.applyUrl` (a non-link is a 400, as over MCP).
  - `docs/contracts.md`.

- [x] **5 · Web: `/inbox`, `/log` removed.** — *2026-10-03.* `npm test` 467/467 (core
  231, api 56, mcp 36, web 144). No migration. **Not seen in a browser** (the Playwright
  MCP was not connected): the tabs' look, the six-tile dashboard row and the vacancy
  page's "Not analysed yet" tag are checked by tests only. For step 6: `/vacancies`'
  `ALL` still lists `NEW` / `FILTERED_OUT` rows, and they get the inbox's buttons there
  (the rule is per row, not per page). For step 7: `/inbox` has no search box.
  - `/inbox` in the nav where Log was, on `VacancyTable`, with three tabs: **Queue**
    (`NEW`, has text), **No text** (`NEW`, no text), **Filtered out** (`FILTERED_OUT`,
    both the user's and the analyzer's `SKIP`). The tab is in the URL (`?tab=no-text`,
    Queue absent, junk → Queue); newest first. `useVacancies` split: `useVacancyRows`
    (the list and its writes) is shared by both pages, keyed under `['vacancies']`.
  - Row actions: Filter out (→ `FILTERED_OUT`) on `NEW`; Back to queue (→ `NEW`) on
    `FILTERED_OUT` without an analysis (`recommendation === null`); an analysed
    `FILTERED_OUT` row gets none. `actionsFor` in `VacancyTable`, over a new `RowAction`
    (`VacancyAction` + `NEW` + `FILTERED_OUT`).
  - Core: `writeStatus` refuses `NEW` on an analysed row with `AnalysedNotNewError`
    (REST `422`, MCP `isError`) — before, the CHECK answered with a `500`.
  - Removed: the `/log` page, `GET /log` (`LogModule`), `VacancyIntakeService.list`,
    and ADR-0026 (ADR-0033 replaces it).
  - Dashboard: an "Awaiting analysis" tile (`status = NEW`); "Not recommended by the
    analyzer" counted on one table (`FILTERED_OUT` + analysed `SKIP`), not
    `logged − recommended`. `/stats` gains `awaitingAnalysis` and `notRecommended`
    (`status = FILTERED_OUT OR recommendation = SKIP`, each vacancy once); ADR-0031
    amended.
  - The vacancy page: "Not analysed yet" in place of the score block, "No posting text"
    in place of the text.

- [x] **6 · Web: status contexts.** — *2026-10-03.* `npm test` 473/473 (core 231, api
  56, mcp 36, web 150). No migration, no core or API change. **Not seen in a browser**
  (the Playwright MCP was not connected); tests only. For step 7: the contexts are
  `STATUS_CONTEXT` (`vacancies/types.ts`). `GET /applications` takes one `status` and
  lists only the pipeline. (Step 7 sends every page's Context through `GET /vacancies`
  with the context's statuses, /applications' included — one row shape.)
  - `/vacancies` = `NOT_REVIEWED`, `SAVED_FOR_LATER`, `DECLINED`, `UNAVAILABLE`;
    `APPLIED` leaves its status filter (it belongs to `/applications`). `ALL` sends the
    four; a bookmarked `?status=APPLIED` falls back to the `NOT_REVIEWED` default (the
    router's `.catch`). A `NEW` / `FILTERED_OUT` / pipeline row no longer reaches the
    table, except a row just applied to until the refetch drops it; `actionsFor` is
    unchanged.
  - `/applications` = the pipeline: unchanged, its endpoint is already scoped to it, so
    `ALL` still sends no `status`. `applicationStatusSchema` is now
    `STATUS_CONTEXT.applications`.
  - `/inbox` = `NEW`, `FILTERED_OUT`: no status filter and no `ALL` (the tabs split it);
    `TABS` is typed by the context, nothing else.
  - `ALL` in a page's filter = that page's statuses.
  - The vacancy page's status select on a `NEW` / `FILTERED_OUT` vacancy: its own status
    plus `actionsFor`'s options (disabled when there are none — an analysed
    `FILTERED_OUT`); other statuses keep the `/vacancies` actions. The backlog row moved
    to `backlog-archive.md`.

- [x] **7 · Web: search in a modal.** — *2026-10-03.* `npm test` 477/477 (core 231, api
  56, mcp 36, web 154). No migration, no core or API change. **Not seen in a browser**
  (the Playwright MCP was not connected); tests only. The radios open on **All** (not asked; the quick check
  "have I seen Acme before?" wants the whole table). The modal's search field is not
  focused on open: `Modal` focuses the dialog itself after its children mount.
  - The toolbar's search field goes (/vacancies, /applications; /inbox had none), with
    its `?q=` URL state; an old `?q=` is dropped by the route's `z.object`. Each of the
    three pages gets a Search button that opens `SearchModal`.
  - The modal: a search field (`SearchInput`, 200 ms debounce, trimmed; an empty term
    asks nothing); radios **All** / **Context**, All selected on open (confirmed by the user 2026-10-03); a checkbox **Hide Filtered out**, on
    by default, enabled only with All. Context = the page's `STATUS_CONTEXT`, whatever
    the status filter shows. All = every status, minus `FILTERED_OUT` while the box is
    checked. All three go through `GET /vacancies` (`search` + a `status` list, ≤ 100,
    "Showing N of total").
  - Results show **inside the modal**, the page's table is untouched. They are
    `CompanyHistoryModal`'s rows: that table is now `ModalVacancyTable`, which both
    modals use. The ⏳ / CV join is `GET /applications?search=` (same company OR title
    match), asked only when the statuses include the pipeline; one page of 500.
  - Per-column filters (backlog) may grow into this modal later.

## Verification, every step

`npm run lint`, `npm run typecheck`, the full `npm test` (the real test DB, invariant 7).
After step 4, end to end: `curl POST /vacancies/intake` without text, then with text →
MCP `list_vacancies(NEW, hasText)` → `get_vacancies_batch` → `submit_analyses_batch`
→ the row on `/vacancies`.
