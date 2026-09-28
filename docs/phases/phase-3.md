# Phase 3: the vacancy log in the DB, application comments and editing

## Goal

Two things that move the tool off local files and get it ready for the cloud and n8n.

1. **The vacancy log.** The `all-vacancy-log` skill dedups postings against a markdown
   file on one machine (`tracker-folder/all-vacancy-log.md`, 1136 rows on 2026-09-25).
   The log moves into Postgres, behind a check-and-record call that agents use through
   MCP, and n8n through REST. Every row already in the file is imported once.
2. **Applications on `/tracker`.** Notes become a timeline you can add to at any time, and
   the apply modal can be re-opened to edit what was entered when applying.

## Decisions settled before planning

- **One URL normalizer on every path.**
  - What it is: every URL that reaches the log goes through `normalizeApplyUrl`, the
    function `applyUrl` already uses.
  - When it runs: on write (only the clean form is stored), on check (the incoming URL
    is normalized *before* the lookup), and in the import (the same `checkMany` path).
  - Where it runs: inside `VacancyLogService` and nowhere else. MCP, REST and the import
    script pass raw input.
  - The url is required (step 9). If normalization fails, a single check is an error
    and a batch skips the entry.
- **LinkedIn collapses to one key, everywhere.** A job id reached through `www`, `pl`,
  `nl` or `/comm/`, with or without the slug and `?trk=`, becomes one key. This applies to
  `EstimatedVacancy.applyUrl` too, with existing rows backfilled
  ([ADR-0027](../decisions/0027-linkedin-site-rule.md)).
- **A single check records too.** A new entry is written whether the call carries one
  entry or many.
- **The check reads the log only, and answers only "new or duplicate".** The import
  copies in the analysed vacancies the file lacks, once; after that the workflow keeps
  them in step (the agent checks before analysing). `EstimatedVacancy` / `Application`
  are never read ([ADR-0026](../decisions/0026-vacancy-log-table.md)).
- **`userComment` stays an editable field.** The new `Comment` table is an append-only
  timeline, and `statusComment` is migrated into it and dropped
  ([ADR-0028](../decisions/0028-comment-table.md)).

## New surfaces

- `VacancyLogEntry` table + `VacancyLogService.check(entry)` / `checkMany(entries)` in
  core.
- MCP tools:
  - `check_vacancy_log` (`url` required) returns `{ new: boolean }`.
  - `check_vacancy_log_batch` (`entries`, 1–`BATCH_MAX`) returns
    `{ new: [url as sent, ...] }`.
- `POST /api/v1/vacancy-log/check` (batch, same result).
- `Comment` table; `ApplicationListItem.comments` replaces `statusComment`.
- `PATCH /api/v1/applications/:id` and `POST /api/v1/applications/:id/comments`.

The `contracts.md` rows land with the step that builds each surface.

## Out of scope

Moved to [`../backlog.md`](../backlog.md) (rows marked "phase 3").

## Decisions introduced this phase

[0026](../decisions/0026-vacancy-log-table.md) ·
[0027](../decisions/0027-linkedin-site-rule.md) ·
[0028](../decisions/0028-comment-table.md)

## Status

- [x] **0 · Docs.** 2026-09-25. This doc, ADRs 0026–0028, the "see 0027" line in
  ADR-0023, and the index rows.

- [x] **1 · LinkedIn site rule + backfill.** 2026-09-25. The 6 collisions (one posting analysed
  twice) kept the newer row. Where the older one carried the application (5 of 6), the
  application moved to the newer row, which became APPLIED. Then 199 rows were rewritten;
  0 non-canonical rows remain.
  - `normalizeLinkedIn` in `packages/core/src/url.ts`, added to `SITE_RULES`.
    - It matches `/(comm/)?jobs/view/(?:[^/]*-)?(\d+)` and rewrites to
      `https://www.linkedin.com/jobs/view/<id>`, with no query.
    - Any other LinkedIn path falls through to the plain query strip.
  - Update the `SITE_RULES` doc comment: this rule owns the host and path, not only the
    query.
  - `url.spec.ts` cases: slug, locale host, `?trk=`, `/comm/`, trailing slash,
    idempotence, and a non-job LinkedIn path.
  - Then `npm run backfill:applyurl -w @job-search-copilot/core` against the dev DB:
    - dry-run first and report the rewrites and collisions;
    - `--commit` only on the user's go-ahead;
    - each collision is resolved by hand (ADR-0023).

- [x] **2 · Core: `VacancyLogEntry` + `VacancyLogService`.** 2026-09-25, reshaped in
  step 9. Migrate with `npm run migrate:dev -w @job-search-copilot/core -- --name <n>`:
  the root script drops `--name` and Prisma then hangs on its prompt, holding the
  advisory lock.
  - Model: `id`, `createdAt` (the record date), `url String @unique` (required after
    step 9), `company String?`, `title String?`, `companyKey String?`, `titleKey String?`
    with `@@index([companyKey, titleKey])`.
  - Key functions `normalizeCompanyKey` / `normalizeTitleKey` in
    `packages/core/src/vacancy-log.ts`: lowercase, collapse whitespace and punctuation;
    for company, also strip legal suffixes (`sp. z o.o.`, `inc`, `llc`, `gmbh`, …).
  - Matching: by normalized `url`, else by `(companyKey, titleKey)`; a later entry in the
    same batch can match an earlier one. A new entry is inserted; a duplicate fills the
    company / title its row lacked.
  - The shape after step 9: `check(entry)` → `{ new: boolean }`, `checkMany(entries,
    { recordedAt? })` → `{ new: string[] }`. `recordedAt` is core-only, for the import.
  - Tests in `vacancy-log.service.spec.ts`, real test DB.

- [x] **3 · MCP tools.** 2026-09-25.
  - `apps/mcp/src/vacancy-log/vacancy-log.tools.ts`, registered in `server.ts`.
  - `check_vacancy_log` and `check_vacancy_log_batch`, shapes under "New surfaces".
  - The descriptions say: only new postings go on to analysis.
  - Cases in `server.spec.ts`; MCP table rows in `contracts.md` (the tool count changes).

- [x] **4 · REST.** 2026-09-25.
  - `POST /api/v1/vacancy-log/check`, body `{ entries: [...] }` (a class-validator DTO),
    returns the core result unchanged.
  - A new `vacancy-log` Nest module shaped like `applications/`.
  - e2e in `apps/api/test/`; `contracts.md` row.
  - This is the surface n8n can reach today, because MCP is stdio-only.

- [x] **5 · One-off import (the [ADR-0021](../decisions/0021-tracker-import-script.md)
  pattern).**
  - `packages/core/scripts/import-vacancy-log.ts`, run with
    `npm run import:vacancy-log -w @job-search-copilot/core -- --file <path>`.
  - Parse with `splitCells` from `tracker-import.ts` (it handles `\|`), and set
    `recordedAt` from the Дата column.
  - Then seed each `EstimatedVacancy` not yet in the log, with `recordedAt = createdAt`.
    Skip synthetic `tracker://` URLs.
  - Every row goes through `checkMany`, so a re-run is idempotent.
  - The dry-run prints:
    - how many URLs normalization changed, with a few before → after examples;
    - which file rows collapse into one;
    - which URLs failed normalization, by line number.
  - Writing needs `--commit` plus the typed `import <N>` gate.
  - Step 1 must be in place first, or the import stores the old LinkedIn keys.
  - Spec for the parser and mapping, no DB. Run against the dev DB once, after the user
    confirms.

  2026-09-25. Run with `--commit`: 1097 rows recorded from
  the file, 37 were duplicates; 3 vacancies were seeded, 418 were already in the log. That
  makes 1100 rows, of which step 9 dropped the 45 without a link. The parser reads
  unescaped `|` and a broken `\ |` in titles; since step 9 a row without a link is
  skipped.

- [x] **6 · The `Comment` table, replacing `statusComment`.** 2026-09-25. The migration
  (`20260925140000_comment_table`) is hand-written: `migrate dev` refuses to drop a
  populated column non-interactively. Applied with `migrate:deploy` to dev (17 notes →
  19 rows) and test. The input field is still named `statusComment` on MCP and REST.
  - Model: `Comment { id, createdAt, body @db.Text, applicationId → Application
    onDelete Cascade, @@index([applicationId, createdAt]) }`.
  - Migration SQL:
    1. create the table;
    2. insert `regexp_split_to_table("statusComment", ' / ')` rows with
       `createdAt = "statusUpdatedAt"`;
    3. drop the column.
  - Core:
    - `updateStatus()` inserts a row instead of appending;
    - `ApplicationListItem.comments` (oldest first) comes through `APPLICATION_INCLUDE`.
  - MCP / REST descriptions updated.
  - **The web moves in this same step**, or `/tracker` fails to parse:
    - `apps/web/src/pages/applications/types.ts` and the MSW fakes;
    - `MergedComment` renders userComment → analyzer comment → comments, each comment
      with its date.
  - Update the `statusComment` row in `domain-model.md` and the rows in `contracts.md`.
  - Tests:
    - core spec: a status note becomes a row, and a second one a second row;
    - api e2e;
    - `MergedComment.test.tsx`.

- [x] **7 · Edit + add-comment backend.** 2026-09-25.
  - `ApplicationService.update(id, { salaryInListing?, usedTailoredResume?,
    userComment? })`, served as `PATCH /api/v1/applications/:id`.
  - `ApplicationService.addComment(id, body)`, served as
    `POST /api/v1/applications/:id/comments`.
  - Errors: `404` unknown id, `400` blank body.
  - Core spec + e2e; `contracts.md` rows.

- [x] **8 · Web: the `/tracker` Action column.** 2026-09-25. Action is 138px, `min-w`
  is 1246px; measured at 1440px: three buttons on one line, exactly within the padding.
  After a schema change, the dev stack needs `npm run generate -w @job-search-copilot/core`
  inside **each** of api / mcp / core: each has its own `node_modules` volume. Then
  restart api / mcp. The end-to-end edit + comment on `/tracker` is left to the user,
  because a comment cannot be deleted.
  - The Copy column becomes Action: `Copy · Edit · Comment` icon buttons with `.tip`
    bubbles (phase 2.1 step 6).
  - Edit re-opens `ApplyDialog` (`pages/vacancies/components/ApplyDialog.tsx`), which
    gains `initial?: ApplyDetails` and a heading prop ("Edit application").
  - Comment opens a small textarea `Modal`.
  - Mutations follow the `useApplications` optimistic / rollback pattern.
  - Re-measure the column widths against `min-w-[1180px]` in a browser.
  - Page-level tests in the tracker test file.

- [x] **9 · Simplify the vacancy log.** 2026-09-25. Added after steps 1–8: the log
  had grown more than the job. It now answers only "new or duplicate".
  - Removed: the duplicate's `userAction` / `applicationStatus` / `byUserAction`,
    `matchedBy`, `logEntryId`, `items[]`, and the `findVacancyMatches` export.
  - `url` is required: migration `20260925180000_vacancy_log_url_required` deletes the
    45 link-less rows and sets NOT NULL. Applied to dev and test.
  - `check` → `{ new: boolean }`, an error without an http(s) url; `checkMany` →
    `{ new: [url as sent] }`, skipping such entries. MCP / REST / import follow.
  - ADR-0026 rewritten; `domain-model.md` and `contracts.md` rows updated.

## Landmines

- **Core is consumed as `dist/`.** Run `npm run build -w @job-search-copilot/core` and
  check its **exit code**, not its output files, before the api / mcp tests. Afterwards
  restart the api/mcp containers in the dev stack.
- **The dev DB is live.** The analyzer writes to it mid-session, so re-run the dry-runs
  (steps 1 and 5) right before `--commit` rather than trusting an earlier count.
- **`index.css` never loads in jsdom.** Step 8's column widths and bubbles are
  browser-only evidence.

## Verification

Per step: `npm test` green **in the same session** before the checkbox is ticked, plus
`npm run lint` and `npm run typecheck`. Commits only on explicit instruction.

End to end:
- After step 5, `check_vacancy_log_batch` on a few real rows from the md file reports
  them as duplicates with the right statuses, and a fresh URL is recorded.
- After step 8, edit an application and add a comment on `/tracker` in the dev stack.
