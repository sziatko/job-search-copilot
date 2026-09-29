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
| **A UI for the status journal, and comment CRUD** | open | phase 3.1 | A separate page. The `StatusChange` journal and the `Comment` table exist; nothing shows the journal, and comments can only be appended. |
| **Auth and an HTTP MCP transport** | open | phase 3 | MCP is stdio-only and the API has no auth. Nothing may be exposed to the cloud before this lands. |
| **Turborepo / Nx** | open | phase 3.1 | npm workspaces is enough for four packages. Wanted for learning, in its own phase; would also answer the `core` dev-loop row below. |

## Improvements and fixes

| Item | Status | From | Notes |
| --- | --- | --- | --- |
| **The full `npm test` fails under load** | open | phase 3.1 step 5, 2026-09-28 | Timeouts (an api e2e `beforeAll`, a web `findBy*` at 5 s) and, on 2026-09-28, a worker killed with SIGTERM on `apps/web/src/lib/url.test.ts`: 30 failed in 372 s, then a rerun passed 357/357 in 85 s. Worth its own look before CI's result is trusted. |
| **Playwright end-to-end tests** | open | 2026-09-21 | Queued after chrome-devtools was dropped. Needs its own phase doc first. |
| **`core` dev-loop friction** | open | phase 1 | Apps consume `core` via `dist/`, so a `core` edit needs a rebuild and an api/mcp restart. Candidate fixes: tsconfig `paths` → `src` with an swc/tsx runner, or TS project references. [ADR-0003](decisions/0003-core-consumed-as-dist.md), `packages/core/README.md`. |
| **CI `docker build` step** | open | phase 1 | Build the production Dockerfile stages in CI to catch `COPY` / dependency regressions. `ci.yml` runs lint, typecheck, test and build only. [ADR-0016](decisions/0016-docker-dev-stack-and-ci.md). |
| **`applyUrl` not URL-validated at the API** | open | phase 1 | `save-vacancy.dto.ts` uses `@IsString @IsNotEmpty`, not `@IsUrl` (the MCP schema does validate it). Stored values are still http(s) only: `normalizeApplyUrl` drops the rest. |
| **MCP tools to edit an application and to add a comment** | open | phase 3 | No MCP tool edits `salaryInListing` / `usedTailoredResume`, and a comment can only ride along with a status move (`update_vacancy_status`'s `comment`). |
| **TanStack Form** | open | phase 2 | The forms are still trivial. Adopt at the first genuinely complex form. [ADR-0020](decisions/0020-web-router-tanstack.md). |
| **Arrow keys and the `role="menu"` contract** | open | phase 2.2 (finding 7) | The ⋯ menu announces `role="menu"` / `menuitem` without the arrow-key navigation those roles promise. A roving-tabindex menu is a keyboard design of its own. |
| **Flip the tip bubble below the control on the top visible row** | open | phase 2.1 step 9, phase 2.2 | A bubble on the first visible row of a scrolled list is clipped by the scroll box. Needs `useVirtualRows` to expose the row's offset. |
| **`scrollIntoView` for the marked row in the company-history modal** | open | phase 2.1 step 8, phase 2.2 | The modal's height cap can hide the row it was opened from (contoso's modal needs 634px for a 540px box). Must not fight the newest-first order. |
| **The toaster misses a theme click until reload** | open | phase 4.1 step 2 | `ThemeToggle` and `main.tsx`'s Sonner `<Toaster>` each call `useTheme()`, so a click changes the page but the toaster keeps its theme until reload. Was so before 4.1. Share one theme state (context or a store event) when it matters. |
