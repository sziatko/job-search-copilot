# Backlog

What is not yet planned into a phase. Two lists, discussed separately:

- **Ideas** — something the app does not do yet: a new page, a new capability.
- **Improvements and fixes** — something that exists and works wrongly, slowly or
  awkwardly.

A deferral or a new idea found while working a phase goes here, not into the phase
doc. Planning a phase marks the items it takes `planned (phase N)`. A row that is done
or no longer applies moves to [`backlog-archive.md`](backlog-archive.md) with its
outcome, so this file holds only live work.

## Ideas

| Item | Status | From | Notes |
| --- | --- | --- | --- |
| **`/profile` page** | open | phase 2 | A `SoonPage` placeholder today. Needs a candidate-profile store; the master resumes would live there (see the next row). |
| **Tailor a resume from the vacancy page** | open | phase 3.1 | A button on the vacancy runs what the `resume-ats-tailor` skill does today, inside the app. The posting text is already in JSC (`fullText`); the master resumes are not — they live on the user's disk and would move into `/profile` first. |
| **`/log` page — a web view of the vacancy log** | open | phase 2, phase 3, 2026-09-28 | A `SoonPage` placeholder today (`apps/web/src/pages/log/LogPage.tsx`). The `VacancyLogEntry` table (phase 3, [ADR-0026](decisions/0026-vacancy-log-table.md)) already records every posting seen. Wanted: every field the log stores (`createdAt`, `url`, `company`, `title`) shown in a table with search, plus a simple form to add an entry. |
| **A UI for the status journal, and comment CRUD** | open | phase 3.1 | A separate page. The `StatusChange` journal and the `Comment` table exist; nothing shows the journal, and comments can only be appended. |
| **Dashboard on real data** | open | 2026-09-28 | Go over every dashboard block and make it true: the pipeline funnel and conversion rates (CTR). Of the KPI tiles, *Awaiting triage* looks right; *Postings* and the rest are not accurate yet (*Postings* counts importer placeholders, see `dashboard/api.ts`). |
| **A page for one vacancy** | open | 2026-09-28 | The vacancy's text from the DB (`fullText`, a placeholder when it is missing), its status timeline, its comment history, and a short table of the company's other vacancies. The timeline and comments overlap the status-journal row above; the other-vacancies table overlaps the company-history modal on `/vacancies`. |
| **Auth and an HTTP MCP transport** | open | phase 3 | MCP is stdio-only and the API has no auth. Nothing may be exposed to the cloud before this lands. |
| **Turborepo / Nx** | open | phase 3.1 | npm workspaces is enough for four packages. Wanted for learning, in its own phase; would also answer the `core` dev-loop row below. |

## Improvements and fixes

| Item | Status | From | Notes |
| --- | --- | --- | --- |
| **Store the application timeout in the DB, set by an automation** | open | 2026-09-28 | Today *Timeout* is derived in the browser (`isTimedOut` in `apps/web/src/pages/applications/constants.ts`: not REJECTED/OFFER and no status move for over `TIMEOUT_DAYS` = 30 days). Wanted: a scheduled job writes it to the DB, so the API, MCP and the dashboard read one stored value. Open question for the phase: a stored flag/date beside `status`, not a new `status` value — `status` is the user's (invariant 3). |
| **Infinite loading on `/vacancies` and `/applications`** | open | 2026-09-27 | Neither table pages as you scroll. `/vacancies` loads only the first 100 rows (`listVacanciesPage`'s default `limit`) and never the rest. `/applications` loads the whole log up front, 500 rows a request, with offset paging over `statusChangedAt desc` — which every status write changes, so a write during a multi-page load can skip a row. Both should fetch the next page as the table scrolls (keyset paging), with the server filtering, sorting and counting. |
| **The full `npm test` fails under load** | open | phase 3.1 step 5, 2026-09-28 | Timeouts (an api e2e `beforeAll`, a web `findBy*` at 5 s) and, on 2026-09-28, a worker killed with SIGTERM on `apps/web/src/lib/url.test.ts`: 30 failed in 372 s, then a rerun passed 357/357 in 85 s. Worth its own look before CI's result is trusted. |
| **Playwright end-to-end tests** | open | 2026-09-21 | Queued after chrome-devtools was dropped. Needs its own phase doc first. |
| **`core` dev-loop friction** | open | phase 1 | Apps consume `core` via `dist/`, so a `core` edit needs a rebuild and an api/mcp restart. Candidate fixes: tsconfig `paths` → `src` with an swc/tsx runner, or TS project references. [ADR-0003](decisions/0003-core-consumed-as-dist.md), `packages/core/README.md`. |
| **CI `docker build` step** | open | phase 1 | Build the production Dockerfile stages in CI to catch `COPY` / dependency regressions. `ci.yml` runs lint, typecheck, test and build only. [ADR-0016](decisions/0016-docker-dev-stack-and-ci.md). |
| **`applyUrl` not URL-validated at the API** | open | phase 1 | `save-vacancy.dto.ts` uses `@IsString @IsNotEmpty`, not `@IsUrl` (the MCP schema does validate it). Stored values are still http(s) only: `normalizeApplyUrl` drops the rest. |
| **MCP tools to edit an application and to add a comment** | open | phase 3 | No MCP tool edits `salaryInListing` / `usedTailoredResume`, and a comment can only ride along with a status move (`update_vacancy_status`'s `comment`). |
| **TanStack Form** | open | phase 2 | The forms are still trivial. Adopt at the first genuinely complex form. [ADR-0020](decisions/0020-web-router-tanstack.md). |
| **Arrow keys and the `role="menu"` contract** | open | phase 2.2 (finding 7) | The ⋯ menu announces `role="menu"` / `menuitem` without the arrow-key navigation those roles promise. A roving-tabindex menu is a keyboard design of its own. |
| **`hasAnalysis` list filter** | open | phase 2.2 | Would make the dashboard's analysed-count tile exact. A server-side filter, a DTO field and a web control. |
| **Flip the tip bubble below the control on the top visible row** | open | phase 2.1 step 9, phase 2.2 | A bubble on the first visible row of a scrolled list is clipped by the scroll box. Needs `useVirtualRows` to expose the row's offset. |
| **`scrollIntoView` for the marked row in the company-history modal** | open | phase 2.1 step 8, phase 2.2 | The modal's height cap can hide the row it was opened from (contoso's modal needs 634px for a 540px box). Must not fight the newest-first order. |
