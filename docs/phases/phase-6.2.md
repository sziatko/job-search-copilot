# Phase 6.2: small fixes from the backlog — scroll reset, phone title, `Modal` focus, 401 redirect, two MCP tools

## Goal

Five rows from [`backlog.md`](../backlog.md), each small and independent. Picked on
2026-10-10 as the cheapest useful work after 6.1; nothing here changes a contract the
other apps depend on except the two new MCP tools.

- **A table keeps its scroll offset across a filter change.** A tile click on
  `/applications` swaps a long list for another long one, and the box stays where it was.
- **The topbar title wraps on a phone.** At 390px "Application tracker" and "Analyzed
  vacancies" take two lines.
- **`Modal` focus.** The search modal does not focus its field on open, and a re-render of
  the page behind moves focus off the field (`onClose` is an inline arrow in the effect's
  dependencies).
- **A 401 mid-session** shows as a load error instead of sending the web to `/login`.
- **MCP cannot edit an application or add a comment** on its own.

## Steps

**1 · Reset the table's scroll on a filter change.** The scroll box's `scrollTop` goes to 0
when the filter (the `useInfiniteList` key) changes — in `useVirtualRows` or the three
tables, whichever is one place. Test: a filter change resets a scrolled box.

**2 · A phone-width topbar title.** Measure at 390px first. A shorter title or a smaller
font below 860px, in the shared `.topbar-title` rule; the topbar must be as tall as on
`/inbox` (66px). CSS only: the evidence is a before/after screenshot.

**3 · `Modal` focus.** `onClose` held in a ref inside `Modal` (the effect no longer
depends on it); an optional `initialFocus` ref, used by the search modal. `ApplyDialog`
needs no change of its own. Tests: focus stays on the field across a parent re-render; the
search field is focused on open.

**4 · A 401 sends the web to `/login`.** `apiFetch` (`apps/web/src/lib/api.ts`) redirects
on 401, except for the session check itself and the login pages (no loop). Test: a 401 from
a page's fetch navigates to `/login`.

**5 · MCP tools to edit an application and add a comment.** `update_application` (salary,
`usedTailoredResume`) and `add_comment` (a USER/AGENT comment without a status move), over
what `core` already has; fill in `core` only if a method is missing. Descriptions are the
one copy of the behaviour (see `CLAUDE.md`). `contracts.md` and the skills that should call
them: update in the same step, tell the user to re-upload. Tests: core (if touched), mcp
(each tool, an unknown id), the skill↔MCP sync test.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`, the backlog rows marked `planned (phase 6.2)` — *2026-10-10.*
- [x] **1 · Scroll reset.** *2026-10-10.* `useVirtualRows` takes a 4th arg `resetKey`; both
  tables (`VacancyTable`, `ApplicationsTable`) got a required `filterKey` prop, passed by the
  three pages (status filter / inbox tab). A new table must pass one.
- [x] **2 · Phone topbar title.** *2026-10-10.* `.topbar-title` is 16px inside the 860px
  media query (one rule in `index.css`); at 390px all three table pages measure 66px. Evidence:
  `.playwright-mcp/step2-before.png` / `step2-after.png` (the topbar was 89px, title on 2 lines).
- [x] **3 · `Modal` focus.** *2026-10-10.* `Modal` takes `initialFocus?: RefObject`; `SearchInput` got an
  optional `inputRef` prop to feed it.
- [x] **4 · 401 → `/login`.** *2026-10-10.* `apiFetch` is now async and, on 401 outside
  `/login` and `/consent`, dynamically imports `@/router` (a static import is a cycle: router →
  pages → api) and navigates; the response is still returned. The session check goes through
  `authClient`, not `apiFetch`, so it is exempt by construction. Test: `lib/api.test.ts`.
- [x] **5 · MCP: edit application, add comment.** *2026-10-10.* New core method `ApplicationService.addComment(id, body, source)` (blank body throws, unknown id null); `update_application` reuses core `update`. `add_comment` `source` defaults to AGENT. No skill calls the new tools, so `skills/` is unchanged and nothing to re-upload.
