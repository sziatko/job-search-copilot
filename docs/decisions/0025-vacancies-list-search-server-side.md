# 0025 — The vacancies list: server-side search, a derived company count, and what stays out of the list item

- Status: Accepted
- Phase: 2.1   ·   Date: 2026-09

## Context

`/vacancies` was built in Phase 1 and reworked in Phase 2 against a UI mockup. In
Phase 2.1 it gains a search box, a "this company appeared before" button and a
row-actions cell. Two of those reach past the web app into `packages/core`'s
`list()`, whose result shape is consumed by **three** transports at once:
`apps/api`, `apps/mcp`, and `apps/web`. That shape is hand-maintained in parallel
in `core` and in the web's zod contract ([ADR-0012](0012-web-hand-written-contract.md)),
so a field added there is paid for twice — and a *derived* field has a third cost:
it exists in the list response and not in the `PATCH .../status` response for
the same resource, while the web parses both with one schema.

The page's filtering also stops being uniform. `/applications` filters entirely
client-side over one `limit=500` fetch, which its own deferred-items list already
flags as a ceiling; the mockup's filter is client-side too. `/vacancies` loads
`limit=100` of ~290 rows.

## Decision

1. **Search is server-side, on `/vacancies` only, as one `search` param** matching
   `company` OR `title` (ILIKE `%term%`), ANDing with the existing filters. The
   status filter stays client-side; the two pages now differ deliberately.
2. **`companyMatchCount` is a derived field on the list item**: the number of
   vacancies whose `company` contains this row's company, case-insensitively —
   i.e. exactly the semantics of the existing `company` filter, because there is
   no `Company` entity to key on. It is computed inside `core` `list()` with one
   extra query scoped to the page's distinct companies, and counted exactly in JS.
   It is **optional** in the web zod schema: that schema also parses the `PATCH`
   response, which carries no derived field.
3. **Application data does not enter the list item.** The company-history modal
   fetches, when it opens, the company's vacancies and the applications list in
   parallel, and joins them client-side on `vacancyId`.

## Why this and not the alternatives

- **Client-side search, exactly as `/applications` does it.** The cheapest option, and
  the mockup's own pattern — but the page holds the newest 100 of ~290 rows, so a
  title or company older than that would return nothing and say nothing.
  `/applications`'s equivalent truncation is a recorded deferral, not a design.
- **Exposing `title?` beside the existing `company?`** (`core` already supports
  both; only MCP exposes `title`). Two params means the client ORs them itself and
  the contract grows a field to express one search box.
- **A single `search` param that also spans `estimationComment`.** The analyzer's
  reasoning is long free text with no trigram index; the ask was title and company.
- **A `Company` table, or a materialized company→count column, or a stats
  endpoint.** Real, and the honest answer at scale — but the count is a *substring*
  match, which `groupBy` cannot express, and one scoped query per list is cheap
  while the table is measured in hundreds of rows. Revisit if it stops being so.
- **Putting the application's dates (`appliedAt`, then `statusUpdatedAt`) on the list item so the
  modal needs one request.** Those fields would ride in every row of the main
  table, in the dashboard's four count calls, and in both MCP list tools — for a
  modal that may never be opened.
- **A dedicated company-history endpoint.** A new surface for a read that two
  existing endpoints already answer.

## Consequences

- Search finds vacancies the page never loaded, and the header count stays honest:
  `total` still means "rows matching the filter".
- The two tables now filter differently, on purpose; the reason lives here rather
  than in a reader's guess.
- The company button is free of extra requests: the count arrives with the list.
  Cost: one more query per `list()` call — including the dashboard's four.
- The modal costs two requests on open, one of them usually already cached under
  `['applications']` (shared with `/applications` and the dashboard).
- One field in the hand-maintained contract pair is optional, which is the single
  place invariant #5 is softened: a server that stops sending it degrades to "no
  company button" instead of failing loudly.

## What this constrains — breaks if you change it

- **`search` must stay an OR of `company` and `title`.** Making it an AND means a
  term that names a company and a term that names a role stop matching anything —
  silently, since a miss is an empty list.
- **`companyMatchCount` must stay "rows whose company *contains* this row's
  company".** The button's visibility rule (`>= 2`) and its badge (`count - 1`)
  both read it; switching it to an exact-match count makes the button disappear on
  companies the modal — using the substring filter — would still list.
- **The web field must stay `.optional()`** in
  `apps/web/src/pages/vacancies/types.ts`. `pages/vacancies/api.ts` parses the
  `PATCH /:id/status` response with `vacancyListItemSchema`, and that
  response is the raw `Vacancy` with no derived field. Make it required
  and every action change fails with "the server returned data in an unexpected
  format".
- **Moving `search` back to the client** silently restores "searches the newest 100
  rows only" — with no error to notice.
- **The modal's join key is `vacancyId`**, carried by the applications
  items and matched against the vacancies items' `id`. Renaming either side leaves
  every row reading "Not applied", because a failed join looks exactly like a
  company nobody applied to.
- **`total` must keep meaning "rows matching the filter"** — the four dashboard
  numbers read it directly ([ADR-0024](0024-web-shell-and-theme.md)); adding
  `search` to those calls would change what they count.

## Related

- [ADR-0012](0012-web-hand-written-contract.md) — the hand-written pair being
  extended here, and why the web cannot import `core`.
- [ADR-0011](0011-web-tanstack-query.md) — the query key / cache shape the modal's
  two reads ride on.
- [ADR-0022](0022-timeout-derived-until-scheduled.md) — owns `statusChangedAt`,
  which the modal's ⏳ is derived from.
- [`../phases/phase-2.1.md`](../phases/phase-2.1.md) — the work this records.
- [`../contracts.md`](../contracts.md) — the REST and MCP rows for `search` and
  `companyMatchCount`.
