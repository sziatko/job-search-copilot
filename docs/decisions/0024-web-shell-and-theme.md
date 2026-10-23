# 0024 — The web app shell and the theme

- Status: Accepted · Date: 2026-09

## Context
The web was built against a mockup ([`docs/design/`](../design/README.md)): an app
shell (sidebar, topbar, per-route chrome), a dashboard at `/`, and a light / dark
theme. Several of these are agreements between files that no compiler checks.

## Decision
1. **The theme** follows the OS until the user picks one. The mechanism is one
   attribute on `<html>`, a contract between three files:
   - `apps/web/index.html` — a pre-paint **classic** script reads
     `localStorage['jsc-theme']` and sets `data-theme` only for a stored `light` /
     `dark`;
   - `apps/web/src/lib/theme.ts` — `getStoredTheme()` / `setStoredTheme()` and
     `useTheme().toggle`: a click stores and applies the opposite of the theme on
     screen. Nothing stored means no attribute. One module-level store
     (`useSyncExternalStore`), so the toggle and the toaster see the same click;
   - `apps/web/src/index.css` — every colour is one `light-dark()` pair; `:root`'s
     `color-scheme: light dark` picks the OS's side, and `data-theme` pins it.
2. **The shell is a parent route**, `RootLayout` (sidebar, topbar), around every
   signed-in page.
3. **Route chrome is declared on the route**: `staticData` of type `RouteMeta`
   (`title`, `rail`). `rail` starts the table-heavy pages with the sidebar collapsed
   to an icon rail.
4. **`/` is the dashboard**, counted by `GET /stats` ([ADR-0031](0031-stats-endpoint.md)).
5. **A page not built yet** renders `SoonPage`, and its sidebar item carries a `SOON`
   badge (part of `/profile` today).

## Why this and not the alternatives
- **The theme applied in React on mount** — the first paint happens before hydration,
  so the page renders light and then flips. The classic script exists to avoid that
  flash.
- **`data-theme="system"` written instead of no attribute** — correct on the first
  paint, then frozen: the CSS could no longer follow the OS.
- **A placeholder page as a dead link, or omitted** — a visible placeholder keeps the
  shell's shape honest.

## Consequences
- No theme flash, no build step for it. The cost: three files agreeing by convention,
  the storage key spelled in two.
- A new page gets navigation, the theme and a title from the shell, and inherits the
  `rail` behaviour.
- With nothing stored, the first click is the only way to leave "follow the OS"; the
  way back is clearing storage.

## What this constrains — breaks if you change it
- **`jsc-theme` and `data-theme` are a three-file contract.** Renamed in one of
  `index.html`, `theme.ts`, `index.css` → a flash, or the stored choice ignored.
  `theme.test.ts` covers the module only; nothing tests the boot script or the CSS.
- **The boot script must stay a classic script**, inside its `try`: Vite defers
  `type="module"` (the flash returns), and private mode makes `localStorage` throw.
- **A page outside `RootLayout`** loses the navigation, the theme toggle and the scroll
  reset at once.
- **A placeholder that becomes real** → remove its `SOON` badge in
  `components/shell/Sidebar.tsx` and its `SoonPage`.

## Related
[ADR-0020](0020-web-router-tanstack.md), [ADR-0031](0031-stats-endpoint.md).
