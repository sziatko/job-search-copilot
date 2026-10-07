# Phase 4.1: fixes after phase 4 — the dashboard, the tables, the theme

## Goal

Web fixes found while using phase 4. One small core change (the stats fields); MCP and
the skills do not change.

What the dev data showed on 2026-09-28 (`GET /stats`): logged > recommended >
analysed, applied a large share of recommended. The `Vacancy` table held only APPLY or
APPLY_WITH_CAVEATS rows — the skill saves only ≥50% and not SKIP — so logged − Vacancy
were dropped by the analyzer, and nothing showed that number. `analysed` counts
`ANALYZER` comments; the placeholders imported from the tracker (ADR-0019) have none, so
the funnel's second stage was smaller than Recommended and read as nonsense.

The timeout stays derived in core (`timedOutWhere`, 30 days, ADR-0022). It never
writes `status` or a `StatusChange` row, so a timed-out application never shows in
Recent activity — the reason the stored-timeout backlog row was closed. The dashboard
shows the count (step 4).

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`; the backlog's stored-timeout
  row moved to the archive as not relevant. — *2026-09-28.*

- [x] **1 · Two small UI fixes.** — *2026-09-28.* No test asserted `Sent` or the
  initials, so none changed.
  - `/applications`' CV column: `✓` / `—` (what it was before the redesign commit
    c38b14e), not `Sent` / `—`. It is the only table with a CV column.
  - `/vacancies/$id`: the header's company initial (`.company-mark`) goes — the div,
    `initials()` in `VacancyPage.tsx`, the CSS rule.
  - **Tests.** Update any assertion on `Sent` or the initials.

- [x] **2 · Theme: two states, the OS picks the first.** — *2026-09-28.* jsdom has
  no `matchMedia`; `src/test/setup.ts` now stubs it (light), since every page test
  renders the toggle. ADR-0024 point 1 carries an amendment note.
  - Nothing stored → no `data-theme`, index.css' `prefers-color-scheme` decides (as
    today; the boot script in `index.html` is unchanged). A click sets the opposite of
    the theme *on screen* (the stored value, else
    `matchMedia('(prefers-color-scheme: dark)')`) and stores it. No way back to
    "system" but clearing storage — what most apps do.
  - `lib/theme.ts`: `'system'` leaves the stored type; `cycle` → `toggle`.
    `ThemeToggle`: sun / moon for the theme on screen, the tooltip names the other.
    `IconMonitor` goes if nothing else uses it.
  - **Tests.** `theme.test.ts`: the first click with nothing stored flips the OS theme
    (mock `matchMedia` both ways), a second click flips back, the stored value is read.

- [x] **3 · Tables: the count in the toolbar, no footer, full height.** — *2026-09-28.*
  The window's 100vh reaches the view through `.main:has(> .view-fill)`; `contain:
  size` on the scroll box is what keeps the 320px floor inside the card on short
  windows (the page scrolls then, ~450px and below).
  - `/vacancies`, `/applications`, `/log`: the toolbar is *count · search · filter*
    ("Showing 40 of 524", no noun); `.table-foot` goes (the rule and the three divs, with
    `/vacancies`' "scores from the vacancy-evaluator skill" note). The count keeps
    today's gate: hidden while loading or on an error.
  - The scroll box fills the window down to its bottom on these three pages (a flex
    column: `.main` at `100vh`, the `.view-fill` view, the card, then
    `.table-body-scroll` with `flex: 1; contain: size`), with a 320px floor for short
    windows; the view's bottom padding drops to its top's. Other users of
    `.table-body-scroll` (the company-history modal, the vacancy page's other-vacancies
    table) keep 560px — the rule uses child combinators. `useVirtualRows` needs only a
    bounded scroll box, which this still is.
  - **Check.** Playwright on the three pages, 1440×900 and 1440×700: the table ends at
    the window's bottom, the page itself does not scroll, the next page still loads.
  - **Tests.** Web tests that read "Showing … of …" find it in the toolbar.

- [x] **4 · Dashboard: the funnel from Recommended, and what dropped out.** —
  *2026-09-28.* "Dropped out" sits in the funnel card under its own `card-head`
  (top border) and reuses the vacancy page's `.fact-list` / `.fact-row` rules — no
  new CSS; step 5's funnel rules do not touch it.
  - **Core.** `StatsService`: `analysed` goes (only the funnel read it); `declined`
    (current `status = DECLINED`) comes in. MCP does not serve stats.
  - **Web.** The funnel is Logged → Recommended → Applied → Got a response →
    Interview. Under it, in the same card, "Dropped out": not recommended by the
    analyzer (`logged − recommended`, floored at 0), declined by you (`declined`),
    rejected (`pipeline.byStatus.REJECTED`), timed out (`pipeline.timedOut`, "no move
    for 30+ days"). The zod schema in `dashboard/types.ts`, `fakeStats` in MSW's
    `handlers.ts`.
  - **Docs.** ADR-0031: the field table, the funnel line; its "`analysed` must stay
    `hasAnalysis`' rule" constraint goes. `contracts.md`' stats row.
  - **Tests.** core: `declined` counts only DECLINED; api e2e: the stats shape; web: the
    funnel labels and conversions (`… of recommended`), the four drop-out numbers.

- [x] **5 · Dashboard: funnel styles.** Load the `dataviz` skill first. —
  *2026-09-28.* The label is hidden at ≤ 860px (the phone breakpoint, unchanged), so
  760 checks only the rows. The colours are the dataviz skill's categorical slots 1–5,
  validated on the track (`#e7edf7` / `#0f1218`); light-mode contrast is below 3:1 for
  four of them, which the row's own name and value text offsets.
  - The conversion label ("49% of recommended") overflows the card: today's grid gives
    it 70px. It must fit inside the card at every width the funnel shows it (> 860px).
    Done as two lines per stage: name · value · label (flex-wrap, the label pushed
    right), then the bar at full width. On one line the funnel card, ~330px at 1100
    wide, left the bar 0px. Near 981px the label wraps under the name.
  - Thicker bars (20px → 28px). Each stage its own bright colour: five tokens
    (`--funnel-1…5`) in `:root` and in both dark blocks of index.css (they must read
    on both themes). The per-row opacity fade goes.
  - **Check.** Playwright on `/`, 1440, 1100 and 760 wide, light and dark: every
    `.funnel-row`'s `scrollWidth <= clientWidth`, a screenshot of each for the user.
