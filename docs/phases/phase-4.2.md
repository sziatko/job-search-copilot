# Phase 4.2: fixes after phase 4.1 — room for the tables, the company modal, statuses

## Goal

Fixes found while using phase 4.1, mostly web:

- **Room for the tables.** On `/applications` the KPI tiles and the header leave the
  table about half the screen; on a phone almost nothing of it shows. The dashboard
  scrolls sideways on a phone.
- **The company-history modal.** Its data goes stale inside a session, its "Action"
  column says only applied / not applied, and it has no row buttons. It is not on
  `/applications` at all.
- **Statuses.** The ⋯ menu on `/vacancies` offers the status the row already has, and
  there is no status for "the posting no longer takes applications".

Decided with the user on 2026-09-29:

- **A repeated status.** The UI does not offer the current status. The server refuses a
  repeat of a **triage** status (`NOT_REVIEWED`, `SAVED_FOR_LATER`, `DECLINED`,
  `UNAVAILABLE`) — it carries no event. A pipeline repeat stays an event: the next
  interview round is `INTERVIEW` again, and the timeout clock restarts from it
  (ADR-0029).
- **`UNAVAILABLE` is triage only.** Never on `/applications`. `/vacancies` filters by it
  like `DECLINED`; the dashboard's "Dropped out" block gets a row for it.
- **The header and the tiles collapse on scroll**, and come back at the top.
- **`/applications` never moves below `APPLIED`** — already true: its select lists only
  the pipeline. Nothing to do.

Scrollbars: native CSS, no library. A library such as OverlayScrollbars wraps the
scroll element, which `useVirtualRows` reads through `scrollRef`.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`; the backlog's ideas: auth
  (Google, LinkedIn, email+password, auto-login), n8n scrapers, live updates over
  WebSocket. — *2026-09-29.* The first `npm test` died on the known SIGTERM flake
  (`applications/constants.test.ts`); the rerun passed 384/384.

- [x] **1 · Header: no subtitle, compact on scroll (every page).** — *2026-09-29.*
  Web project only (123/123). Playwright MCP writes screenshots only inside the repo
  (`.playwright-mcp/`, not gitignored): save there, move them out, delete the folder.
  - `subtitle` goes: `staticData` in `router.tsx`, `lib/routeMeta.ts`,
    `components/shell/Topbar.tsx`, `.topbar-sub` in `index.css`.
  - `RootLayout.tsx`: one `document.addEventListener('scroll', h, { capture: true,
    passive: true })` — scroll does not bubble, but capture sees any element's scroll,
    the window's and `.table-body-scroll`'s alike. It sets `data-compact` on `.main`:
    on when `scrollTop > 24`, off only at `0` (the header's own shrink moves the scroll;
    without the gap it jitters). Reset on a pathname change, beside the existing
    `scrollTo`.
  - `.main[data-compact] .topbar`: padding 16 → 8px, title 20 → 16px, a transition.
  - **Tests.** The title renders with no subtitle; a `scroll` on an element sets and
    clears `data-compact`.
  - **Check.** Playwright on `/applications` at 1440×900: a screenshot before and after
    a scroll.

- [x] **2 · `/applications` tiles: a compact strip.** — *2026-09-29.* Web project only
  (123/123). The strip's rules are written twice in `index.css` (under
  `.main[data-compact]` and in the 860px query) — change both. At 390×844 the page
  already does not scroll (`scrollHeight` 844) and `scrollWidth` is 390 on
  `/applications`; the strip shows a classic horizontal scrollbar in Chromium — step 4's.
  - CSS only, on step 1's `data-compact`, scoped `.view-fill .kpi-row` — the dashboard's
    tiles do not change. One row of chips ("Applied 12", "Interview 3"): `flex`, no
    wrap, `overflow-x: auto` inside the strip, the hint hidden. Still filter buttons.
  - At ≤ 860px the strip is always on (today: two columns, three or four rows).
  - `.main:has(> .view-fill)`: `100vh` → `100dvh`.
  - **Tests.** No logic changes; the KPI tests stay green.
  - **Check.** Playwright at 1440×900 and 390×844: the table box grows after a scroll;
    on a phone the page itself does not scroll
    (`document.scrollingElement.scrollHeight <= innerHeight`). Screenshots.

- [x] **3 · Mobile: no horizontal scroll.** — *2026-09-29.* Web project only
  (123/123). One cause: `.dash-grid`'s bare `fr` tracks, floored at a card's
  min-content, where an `.attn-title`'s nowrap text counts at full length. Now
  `minmax(0, …)`. The suspects were clear: `.tip` and the tables' 760px sit inside
  `overflow` boxes, and `.search-input` fits at 360.
  - Playwright at 390×844 on `/`: list the elements whose
    `getBoundingClientRect().right > innerWidth` and fix that cause, not the symptom.
    Suspects: `.tip` (absolute, nowrap), the global `table { min-width: 760px }`,
    `.search-input`'s `min-w`.
  - The dashboard's cards padded on every side like the other pages'; long text ends in
    an ellipsis or wraps.
  - `/applications`: the page scroll of "a couple of paddings" is gone after step 2; if
    not, fix the paddings.
  - **Check.** 390 and 360 wide on `/`, `/vacancies`, `/applications`, `/log`:
    `document.documentElement.scrollWidth <= clientWidth`. Screenshots.

- [x] **4 · Scrollbars.** `scrollbar-width: thin; scrollbar-color: var(--scroll-thumb)
  transparent` (Chrome, Edge, Firefox) plus `::-webkit-scrollbar*` for Safari; the
  tokens in `:root` and both dark blocks of `index.css`. — *2026-09-29.* Web project
  only. On `*` in the base layer (`scrollbar-width` does not inherit). The Safari
  path is unverified — Chromium ignores `::-webkit-scrollbar` once the standard
  properties are set.
  - **Check.** Screenshots, light and dark.

- [x] **5 · Company-history modal: Status, row actions, always fresh.** — *2026-09-29.*
  Web project only (124/124). The modal's tests live in `useVacancies.test.ts`
  (`the duplicates button and its modal`); the freshness test sets the client's
  `staleTime` to the app's 30s — the test clients default to 0, which refetches anyway.
  `pages/vacancies/components/CompanyHistoryModal.tsx`:
  - "Action" → **Status**: the `STATUS_TAGS` tag from `item.status` (the vacancy list
    item carries it) — no longer gated on the applications query.
  - A new **Actions** column: `DetailsLink` and `CopyVacancyButton`, in
    `flex gap-[6px]` as in the tables.
  - The applications query stays, for the ⏳ timeout mark only. Both queries get
    `staleTime: 0`, so every open refetches. The "Action column is hidden" error line
    goes.
  - **Tests.** Each row's status tag; a status change then a reopen shows the new
    status (MSW); the Details link points to `/vacancies/$id`.

- [x] **6 · The company modal on `/applications`.** — *2026-09-29.* core 193, api 41,
  mcp 31, web 125. Only `list` carries the count (`ApplicationListRow` in core); the
  single-row responses do not, so the web field is `.optional()`. No browser check.
  - **Core.** The count in `VacancyService.withDerivedFields` moves to a module-level
    `companyMatchCounts(db, names)`; `ApplicationService.list` adds `companyMatchCount`
    to its items.
  - **Web.** `companyMatchCount` in `applicationListItemSchema`; `ApplicationsTable`
    gets `VacancyTable`'s `.meta-btn`; `ApplicationsPage` renders
    `CompanyHistoryModal`.
  - **Docs.** `contracts.md`: the applications list item.
  - **Tests.** core: the field on the applications list; api e2e: the shape; web: the
    button opens the modal.

- [x] **7 · The current status is not offered; a triage repeat is refused.** —
  *2026-09-29.* core 195, api 42, mcp 31, web 125. `TRIAGE_STATUSES` is not exported
  from core's index (only `SameStatusError` is) — step 8 adds `UNAVAILABLE` there. The
  web test "sends nothing when ⋯ picks the current status" became "does not offer" — the
  early return is unreachable from the menu now. No skill text changed (the tracker's
  "same status is an event" is about pipeline statuses).
  - **Web.** `RowActionMenu` takes `current` and leaves it out; a `DECLINED` row has
    no Decline button. `useVacancies`' same-status early return stays.
  - **Core.** `TRIAGE_STATUSES` in `status.ts`. `writeStatus`: for a triage status,
    `updateMany` also requires `status: { not: status }`; `count === 0` on an existing
    row throws `SameStatusError extends DomainError` (API 422, MCP `isError`).
  - **Docs.** `domain-model.md` § StatusChange, an amendment note on ADR-0029,
    `contracts.md`, the MCP `update_vacancy_status` description and
    `SERVER_INSTRUCTIONS`. `skills/`: a changed text → tell the user to re-upload.
  - **Tests.** core: a triage repeat throws and journals nothing; a repeated
    `INTERVIEW` is still journaled; the existing "same status is an event" specs move to
    a pipeline status where they used a triage one. api e2e: 422. web: the menu lacks
    the current status; a `DECLINED` row has no Decline.

- [x] **8 · New status `UNAVAILABLE`** ("no longer accepting applications"). —
  *2026-09-29.* core 197, api 44, mcp 31, web 126. `20260929120000_add_unavailable_status`
  applied to the dev DB on 2026-09-29 (`migrate:deploy`, api/mcp restarted — but no
  `prisma generate` inside the containers: the 400 and 500 step 9 fixes). Tag variant
  `bad`, like `DECLINED`. No skill lists triage statuses — no skill text changed.
  - **Migration.** `ALTER TYPE "VacancyStatus" ADD VALUE 'UNAVAILABLE' AFTER
    'DECLINED'` — nothing sorts by status. The dev DB waits for the user's go-ahead.
  - **Core.** In `TRIAGE_STATUSES`. `StatsService`: `unavailable` (current status).
  - **Web.** `vacancyStatusSchema`, `vacancyActionSchema` (filter + actions),
    `STATUS_LABELS` / `STATUS_TAGS`, `ACTION_CONTROL` → `'menu'` (one click in ⋯, no
    confirm), `StatusFilterSelect`. `VacancyPage`: `TRIAGE_OPTIONS`, `CLOSED_BAD`.
    Dashboard "Dropped out": a row for it; `dashboard/types.ts`, MSW's `fakeStats`.
  - **MCP.** `VacancyStatusEnum` follows the Prisma enum; the descriptions that list
    statuses.
  - **Docs.** `domain-model.md` (the status row, the lifecycle, the add-a-status
    checklist), ADR-0031's field table, `contracts.md`, `skills/` if one lists
    statuses.
  - **Tests.** core: a move to it, stats `unavailable`; api e2e: the PATCH, the stats
    shape; web: the menu sets it without a confirm, the filter, the Dropped-out row.

- [x] **9 · Fixes after manual testing.** — *2026-10-01.* core 197, api 44, mcp 31,
  web 123. The full run's api `applications.e2e` timed out in `beforeAll` (Nest boot,
  10s hook, a loaded machine); the api rerun passed 44/44. No browser check here —
  Playwright MCP did not connect; the live api was probed with curl.
  - **400 on Unavailable, 500 on `/` and on `/stats`, no tiles on `/applications`** —
    one cause: api / mcp / core each keep their own `node_modules` volume, and none had
    regenerated the Prisma client after step 8's migration. `@IsEnum(VacancyStatus)`
    refused `UNAVAILABLE`; `StatsService`'s count on it threw
    `PrismaClientValidationError`; `ApplicationsPage` renders the tiles only once
    `/stats` answers. Fix: `docker-compose.yml` runs `npm --prefix /repo run generate`
    before each of the three starts, so `docker compose restart api mcp core` is the
    whole step after a migration (`architecture.md`).
  - **No ⋯ menu.** Every status has its own row button — Apply · Decline · Save for
    later · Mark unavailable · Mark not reviewed — minus the row's own status (a
    pipeline row counts as Applied), so every row has four. `ROW_BUTTONS` in
    `VacancyTable` is total over `VacancyAction`; `ACTION_CONTROL`, `MENU_ACTIONS`,
    `RowActionMenu`, `IconMore`, `.row-menu` and the jsdom popover stub are gone.
    Action column 210 → 246px. The backlog's `role="menu"` row is archived.
  - **Tests.** web: the four offered buttons per status, the locked pipeline row, the
    in-flight state, the bubbles and the width; the popover tests went with the menu.
