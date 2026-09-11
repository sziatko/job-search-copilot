# Phase 2 — application tracking

## Goal

Phase 1 could record *that* the user acted on an analysed vacancy (`userAction`),
but not *what happened next*. Phase 2 adds a first-class **`Application`** row per
submitted application — its pipeline stage, the salary in the listing, whether a
tailored CV was used, the user's own note — plus a `/tracker` page to work through
it, writes from **both** the web `ApplyDialog` and an MCP chat tool, a real router
with an index page, and (last, separately) a one-off import of the user's existing
`tracker.md` log.

## Scope

1. `Application` model + `ApplicationStatus` enum + migration.
2. `ApplicationService` in `packages/core` (the only DB client — invariant #1).
3. `apps/api` `applications` module: `POST` / `GET` / `GET /:id` / `PATCH /:id/status`.
4. `apps/mcp`: `record_application`, `list_applications`, `update_application_status`.
5. `apps/web`: `@tanstack/react-router`, an index page, the `/tracker` page, and
   wiring the three `ApplyDialog` fields that Phase 1 collected and discarded.
6. A one-off `packages/core/scripts/import-tracker.ts`.

## Data model

- **Strict 1:1** — every `Application` links to exactly one `EstimatedVacancy`
  (`estimatedVacancyId Int @unique`, NOT NULL, `onDelete: Cascade`). `Application`
  stores only the delta: `status`, `statusUpdatedAt`, `salaryInListing`,
  `usedTailoredResume`, `userComment`, `appliedAt`, timestamps. Company, title,
  applyUrl, matchScore, recommendation, analyzer comment are read through the join.
  Rationale and the rejected alternatives: [ADR-0017](../decisions/0017-application-1to1-delta.md).
- **`ApplicationStatus`** = `APPLIED, RECRUITER_SCREEN, REPLIED, INTERVIEW, OFFER,
  REJECTED, NO_RESPONSE` — a separate axis from `UserAction`
  ([ADR-0018](../decisions/0018-application-status-separate-enum.md)).
- A never-analysed application still gets a real `EstimatedVacancy` row: placeholder
  analyzer fields (`fullText:'N/A'`, `matchScore` from the tracker text or `0`,
  `recommendation` derived from that score, `estimationComment` from the notes or
  `'N/A'`), `userAction:'APPLIED'` at creation
  ([ADR-0019](../decisions/0019-record-or-create-vacancy.md)).

## New surfaces

- **REST** — `POST /api/v1/applications` (always `201` + `Location`; body =
  `{ application, resolution, vacancyCreated }`), `GET` (filters `status`, `search`,
  `limit` ≤ 500, `offset`), `GET /:id`, `PATCH /:id/status`. Details + "breaks if"
  in [`../contracts.md`](../contracts.md).
- **MCP** — three tools; `record_application` takes `company` + `title` (required)
  and find-or-creates the vacancy, the other two mirror the list/update pattern.
- **Router** — `@tanstack/react-router`, code-based, routes `/` (index, two nav
  cards), `/vacancies` (the Phase 1 page), `/tracker`. `/tracker` search + status
  filter live in the URL, zod-validated
  ([ADR-0020](../decisions/0020-web-router-tanstack.md)).

## Record-or-link algorithm

`ApplicationService.record` runs in one transaction:

- **by id** (web) — the row is known; link directly.
- **by (company, title)** (MCP / import) — case-insensitive exact match:
  one → link; zero → create a placeholder vacancy; more than one → `AmbiguousVacancyMatchError`.
- On link to an existing vacancy whose `userAction` isn't `APPLIED`, flip it to
  `APPLIED` (+ `userActionUpdatedAt`) — the only place other than `updateUserAction`
  that writes `userAction`. A second application for the same vacancy →
  `ApplicationAlreadyExistsError`.

`recordMany` runs the whole batch in one transaction (the importer relies on
all-or-nothing).

## Import

`packages/core/scripts/import-tracker.ts` — `--file <path>` (the file lives outside
the repo), dry-run by default, real write only under `--commit` after a typed
`import <N>` confirmation. Parses the markdown table, maps columns + the Ukrainian
status vocabulary, and **stops and asks** on any anomaly (missing date, an
unmappable status, a column-shift that isn't a clean one-extra-cell, two rows that
resolve to the same vacancy, an `applyUrl` collision). Not in CI, not re-run.
[ADR-0021](../decisions/0021-tracker-import-script.md).

## Decisions introduced this phase

[0017](../decisions/0017-application-1to1-delta.md) ·
[0018](../decisions/0018-application-status-separate-enum.md) ·
[0019](../decisions/0019-record-or-create-vacancy.md) ·
[0020](../decisions/0020-web-router-tanstack.md) ·
[0021](../decisions/0021-tracker-import-script.md)

## Status

- All steps landed: migration `20260910205538_add_application_model`,
  `ApplicationService` + spec, the api module + e2e, the three MCP tools + spec,
  the router + index page + `features/applications/` + tests, `ApplyDialog` wired,
  the importer (`src/tracker-import.ts` + `scripts/import-tracker.ts` + 26 unit tests).
- `npm test` → **120 passed, 11 files**. `npm run lint` / `typecheck` / `build` clean.
- **Tracker import run (2026-09-11):** 206 rows written in one transaction against
  the dev DB — 3 linked to already-analysed vacancies (their `userAction` flipped to
  `APPLIED`), 203 created placeholder `EstimatedVacancy` rows (40 with a synthetic
  `tracker://` URL, `fullText:'N/A'`). One row (line 189, a re-application to
  an agency for the same title) was disambiguated in `tracker.md`
  before the run. The mapper also infers `usedTailoredResume` from the notes
  ("Резюме адаптоване…", "Adaptовано CV…"; 11 rows) and would pull a quoted salary
  out of the notes when the column is blank (0 matches in this file). Re-import is
  via `import:tracker --reset --commit` (wipes prior applications + placeholder
  vacancies, keeps real analysed ones).

## Post-phase tweaks (2026-09-11)

- `/tracker` sorts strictly by `appliedAt` desc (newest first); the whole-cell
  comment (`MergedComment`) clamps to 3 lines *combined* with one expand toggle.
- **Both tables are row-virtualized** (`@tanstack/react-virtual`, shared
  `src/components/useVirtualRows.ts`): the scroll container is `max-h-[70vh]
  overflow-auto`, `<table>` is `table-fixed` with a `<colgroup>`, `<thead>` is
  sticky, and only the visible ~window of `<tr>`s is in the DOM (two spacer rows
  size the scrollbar). No backend change — client-side filter/search/sort/stats
  stay. Feels like infinite scroll; good to ~10k rows. Server-side paging stays
  deferred (below).
- Test setup (`apps/web/src/test/setup.ts`) now stubs jsdom layout
  (`getBoundingClientRect`, `client/offset/scrollHeight`, a callback-invoking
  `ResizeObserver`) so a virtualized table renders rows under jsdom.

## Deferred

| Item | Why |
| --- | --- |
| **TanStack Form** | This phase's forms are trivial (4 fields, one `<select>`). Adopt at the first genuinely complex form. |
| **Ambiguous-match resolution UI** | `AmbiguousVacancyMatchError` is currently just reported; a picker can come later. |
| **`/tracker` server-side pagination / search / stats** | Row virtualization handles the DOM cost; the whole log still loads in one `limit=500` request. Revisit when the dataset is tens of thousands and one response is genuinely heavy. |
| **`get_application` MCP tool** | Not needed yet — `list_applications` covers the read side. |

## Explicitly decided *against*

- **A snapshot copy of company/title on `Application`** — a strict 1:1 join is
  cheaper than the drift risk ([ADR-0017](../decisions/0017-application-1to1-delta.md)).
- **Making the analyzer fields nullable** — would tax every Phase 1 change; the
  placeholder-row approach keeps the Phase 1 schema untouched
  ([ADR-0019](../decisions/0019-record-or-create-vacancy.md)).
- **An `OTHER` `ApplicationStatus`** — freeform tracker statuses map to the nearest
  value with the raw text kept in `userComment`.
