# 0024 — The web app shell: a three-state theme, a dashboard at `/`, two placeholder routes

- Status: Accepted
- Phase: 2   ·   Date: 2026-09-19

## Context

Phase 2 shipped a router whose `/` was an index of two navigation cards
([ADR-0020](0020-web-router-tanstack.md)) and exactly one real page, `/applications`.
The app was then rebuilt against a UI mockup — `c38b14e`, 55 files, +3369/−561,
with the mockup itself committed at
[`docs/design/dashboard-reference_2.html`](../design/dashboard-reference_2.html).

What came out of that is not styling. The app gained an **app shell** (sidebar,
topbar, route metadata), a **landing page with its own numbers**, a **theme with
persistent state**, and **two placeholder routes**. Three of those are agreements
between files that no compiler checks.

## Decision

1. **The theme has three states**, not two: `'system' | 'light' | 'dark'`
   (`apps/web/src/lib/theme.ts`). The mechanism is one attribute on `<html>`, and
   it is a contract between **three** files:
   - `apps/web/index.html` — a pre-paint **classic** script reads
     `localStorage['jsc-theme']` and sets `data-theme` **only** for an explicit
     `light`/`dark` choice;
   - `apps/web/src/lib/theme.ts` — `applyPreference()` writes `data-theme` for
     light/dark and **removes** it for `system`; `setStoredPreference()` writes or
     removes the same key;
   - `apps/web/src/index.css` — `:root` is the OS media query, `data-theme="light"`
     blocks it with a `:not()` guard, `data-theme="dark"` overrides everything.
2. **`/` is the dashboard.** The route set becomes `/`, `/vacancies`, `/applications`,
   `/log`, `/profile`. The sidebar carries navigation; the landing page answers
   what the app is opened for.
3. **`/log` and `/profile` are placeholders** rendering `SoonPage` — no backend
   behind either. (`/log` stopped being one in phase 4 step 1: the `VacancyLogEntry`
   table, searched and scrolled.) `/log` describes the ingestion log that does not exist yet (every
   posting seen, including duplicates and below-threshold rejections), which is the
   same future work [ADR-0023](0023-canonical-applyurl.md) names in its Context.
4. **The dashboard counts without a stats endpoint.** Four cached list calls, one of
   them `limit=1`, read `total` as the number of rows *matching the filter*
   (`apps/web/src/pages/dashboard/api.ts`).
5. **Route chrome is declared, not composed** — each route carries `staticData` of
   type `RouteMeta` (`title`, `subtitle`, `rail`). `rail` collapses the sidebar to
   an icon rail for the table-heavy views so the tables get the width.

## Why this and not the alternatives

- **A two-state theme.** Cannot express "follow the OS", which is what a
  first-time visitor should get, and is the only state that stays live when the OS
  flips under an open tab.
- **Writing `data-theme="system"` instead of removing the attribute.** Correct on
  the first paint and frozen from then on: the CSS could no longer follow the OS.
- **Applying the theme in React on mount.** First paint happens before hydration, so
  the page renders light and then flips — precisely the flash the classic script
  exists to avoid, and the reason that script must not become `type="module"`.
- **A `/stats` endpoint.** `total` in a list response is already the match count, so
  `limit=1` returns a number with one row's worth of payload. Four small requests,
  no new surface, and nothing to keep in sync with the filters the counts describe.
- **Keeping `/` as two navigation cards.** The cards duplicated the sidebar and
  answered nothing; the dashboard answers something the sidebar cannot.
- **Making `/log` and `/profile` dead links or omitting them.** A visible
  placeholder that states what is missing keeps the shell's shape honest — and the
  `SoonPage` copy doubles as the backlog entry.

## Consequences

- The landing page reports the log's own numbers with no new endpoint. Cost: four
  requests on first load, and every one of those numbers inherits `total`'s meaning.
- Theming needs no build step and never flashes. Cost: three files agreeing by
  convention, and the storage key written as a literal in two of them.
- The shell wraps every route, so a new page gets navigation, theming and a title
  for free — and inherits the sidebar's `rail` behaviour whether or not that suits it.
- `/log` renders `SoonPage` without the sidebar's `SOON` badge, while `/profile`
  has one. Cosmetic, and worth removing when either page becomes real.

## What this constrains — breaks if you change it

- **`jsc-theme` and `data-theme` are a three-file contract.** Renaming either in one
  of `apps/web/index.html`, `apps/web/src/lib/theme.ts`, `apps/web/src/index.css`
  leaves the app painting unthemed and then flipping (flash), or ignoring the stored
  choice entirely. Nothing fails to compile or to test —
  `apps/web/src/lib/theme.test.ts` pins the module's half only, and neither the boot
  script nor the CSS is exercised by any test.
- **`data-theme` must stay *absent* for `system`.** Writing `"system"` freezes the
  page on whatever the media query said at load, and breaks the live OS following.
- **The boot script must remain a classic script.** Vite defers `type="module"`
  ones, which reintroduces the flash. It also has to stay inside its `try` — private
  mode makes `localStorage` throw on access.
- **`total` in a list response must stay "rows matching the filter", not "rows on
  this page".** Four dashboard numbers are read straight off it, so a change there
  misreports silently rather than erroring. See
  [`contracts.md`](../contracts.md) — the REST table.
- **A placeholder stopping being a placeholder** means removing the `SOON` badge in
  `apps/web/src/components/shell/Sidebar.tsx` and the `SoonPage` usage in
  `apps/web/src/router.tsx`. A working page still badged SOON reads as broken.
- **Moving a page outside `RootLayout`** loses the navigation, the theme toggle and
  the scroll reset on navigation in one go — the shell is a parent route, not a
  wrapper each page applies.

## Related

- [ADR-0020](0020-web-router-tanstack.md) — the router this amends. **Its route list
  (`/`, `/vacancies`, `/applications`) is now stale**; the decision it records still stands.
- [ADR-0011](0011-web-tanstack-query.md) — the data layer the dashboard reuses.
- [ADR-0012](0012-web-hand-written-contract.md) — why the web declares its own API
  types instead of importing `core`.
- [ADR-0022](0022-timeout-derived-until-scheduled.md) — owns `statusChangedAt` (the timeout clock),
  which the dashboard's activity feed sorts on.
- [`docs/design/README.md`](../design/README.md) — the mockup and what it does *not*
  decide (it is an artifact, not prose).
