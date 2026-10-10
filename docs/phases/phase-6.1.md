# Phase 6.1: fixes after phase 6 — brand icons, a note on Save for later, `AWAITING`, room for the tables

## Goal

Fixes found while using phase 6. Later ones go to phase 6.2.

- **Brand icons.** The app has no favicon and no home-screen icon; the sidebar shows a
  generic briefcase. A logo set was drawn for it (`docs/design/images/`, untracked).
- **Save for later says nothing.** It moves the row straight away; there is no place to
  note why the vacancy was set aside.
- **No status for "waiting on them".** After a test task is sent or an interview is
  done, the application waits for feedback; the pipeline has no stage for that.
- **Room for the tables.** On `/applications` the tiles and the gaps around them hide
  most of the table, and the compact header's title is not centred.

Decided with the user on 2026-10-07:

- **The comment dialog is Save for later's only.** Decline keeps its plain confirm.
  The comment is optional, saved as a `USER` comment in the same transaction as the
  status move (`PATCH /vacancies/:id/status` gains `comment?`), so it shows in the
  vacancy's comment list like any other.
- **`AWAITING` ("Awaiting")**, a pipeline status right after `INTERVIEW`. It is open, so
  the 30-day timeout applies; the dashboard counts it as *responded*, not *interviewed*.
- **Logo set:** `public/` takes `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`,
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `site.webmanifest`.
  `logo.svg` is dropped (byte-identical to `favicon.svg`), and so is the set's README
  (instructions, not an asset). `JscLogo` joins `components/icons.tsx`.

## Steps

**1 · Logo, favicon, mobile icons.** The files above into `apps/web/public/` (Vite copies
it to the root of `dist`; nginx serves it as is). `index.html` gets the five head tags:
`icon` (ico, `sizes="48x48"`), `icon` (svg), `apple-touch-icon`, `manifest`,
`theme-color` `#2E5CD6`. `JscLogo` replaces `.brand-mark` + `IconBriefcase` in the
sidebar (the `.brand-mark` CSS goes) and the briefcase on the login and consent pages
(there it replaces the `.soon-icon` tile too, at 52px — the logo draws its own tile);
`IconBriefcase` goes, nothing else used it. Then `docs/design/images/` is deleted.
Test: the sidebar renders an `img` named "Job Search Copilot".

**2 · Save for later → a dialog with an optional comment.**
- core: `VacancyService.updateStatus(id, status, comment?)`. `commentOn` moves from
  `application.service.ts` to `status.ts` (both services import it already); a blank
  comment writes nothing.
- api: `UpdateVacancyStatusDto.comment?` (`@IsOptional() @IsString()`, as on
  `UpdateApplicationStatusDto`), passed through.
- web: `updateVacancyStatus(id, status, comment?)`; a `SaveForLaterDialog` (`Modal` + a
  textarea, as the comment field in `ApplyDialog`); in `useVacancyRows` a `pendingSave`
  like `pendingDecline`, and `ActionChange.comment?`. `VacanciesPage` and the vacancy
  page's status select both open it.
- `contracts.md`: the body of `PATCH /vacancies/:id/status`.
- Tests: core (the comment lands with the move; a blank one adds no row), api e2e, web
  (the dialog opens; an empty submit sends no `comment`, a filled one does; Cancel writes
  nothing).

**3 · `AWAITING`.**
- Migration (`npm run migrate:dev`), the value after `INTERVIEW` in `schema.prisma`.
  Restart `api mcp core` in Docker after it.
- core: `PIPELINE_STATUSES` (`OPEN_PIPELINE_STATUSES` follows); `RESPONDED` in
  `stats.service.ts`.
- web (hand-written contract, invariant 5): both status lists in `vacancies/types.ts`,
  `STATUS_LABELS` / `STATUS_TAGS`, `APPLICATION_STATUS_LABELS` /
  `APPLICATION_STATUS_ORDER` (`OFFER 0, INTERVIEW 1, AWAITING 2`, the rest shift), the
  dashboard's activity verb, the msw handlers. The `/applications` tiles and filter are
  built from `applicationStatusSchema.options`, so they follow.
- mcp: the status list in `SERVER_INSTRUCTIONS` and the status tool's description (what
  `AWAITING` means). The enum comes from core.
- skills (private repo, its own commit; the user re-uploads): a row in
  `application-status-tracker`'s table — a "thanks, we'll get back with feedback" email
  after a test task or an interview → `AWAITING`.
- `domain-model.md` (the lifecycle), `contracts.md` (the status list).
- Tests: core (`AWAITING` is pipeline and open, and times out; stats counts it in
  `responded`, not `interview`), web (the Awaiting tile and filter), the skill↔MCP sync
  test.

**4 · Room for the tables, a centred compact title.** Measure first, in a real browser
(Playwright or Chrome), on `/applications`, `/vacancies` and `/inbox`, desktop and phone
width; screenshots before and after.
- The compact title: `.topbar` is `items-end`, so the title sits on the bottom of the
  34px buttons → `items-center`.
- The gaps between the topbar, the tiles, the toolbar and the table: `.view` `pt-24`,
  `.kpi-row` `mb-20`, `.toolbar` `pb-14` plus each page's `pt-[16px]`. Cut them in the
  shared rules, not page by page.
- A large gap between the table's `<thead>` and its first row, cause not yet known — a
  stale `paddingTop` spacer row from `useVirtualRows` is one suspect. Find the cause
  before changing anything. *Not reproduced (2026-10-07): at scroll 0 the first `<tr>`
  is row 0, not a spacer, and it starts 0px under the `<th>` on all three pages, both
  widths, after scrolling down and back (wheel and programmatic) and after a tile
  filter. Nothing changed for it; it needs a repro (which page, width, what was done
  before).*
- CSS only: the evidence is the screenshots and a green `npm test`.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`. — *2026-10-07.* Docs only.
- [x] **1 · Logo, favicon, mobile icons.** — *2026-10-07.* `favicon.svg` gained a
  `<title>` and `site.webmanifest` was reformatted: Biome checks `apps/web/public/`.
- [x] **2 · Save for later → a dialog with an optional comment.** — *2026-10-07.*
- [x] **3 · `AWAITING`.** — *2026-10-07.* Migration `20261007120000_add_awaiting_status`,
  written by hand and applied to the test DB only; the dev DB and the Docker restart are
  left to the main session. The skill's table is keyed by Gmail label: its row needs a
  new "Job search/Чекаю фідбек" label, which the user creates by hand. `contracts.md`
  had no status list — `/stats`' `byStatus` row lists them now, and ADR-0031's
  `responded` row gained `AWAITING`.
- [x] **4 · Room for the tables, a centred compact title.** — *2026-10-07.* Measured
  at 1440×900 and 390×844 in Chrome (same-origin iframes: the window would not resize).
  Title centre vs topbar centre: +3.1 / +6.1px (flat / compact) → −0.4, as the buttons.
  `.view` pt 24 → 16 (phone 18 → 12), `.kpi-row` mb 20 → 12 (the compact and phone
  overrides lost their now-equal `mb`), `.toolbar` pb 14 → 10, the pages' `pt-[16px]`
  → `.view-fill > .card > .toolbar` pt 12. The table's scroll box at 1440: /applications
  604 → 628px flat, 685 → 701 compact; /vacancies and /inbox +16. The `<thead>` gap was
  not reproduced (see the step). Only web was run (169/169).
