# 0030 — The web's tables page by a Prisma cursor; MCP keeps offset

- Status: Accepted
- Phase: 4   ·   Date: 2026-09

## Context

Phase 4 makes every web table (`/log`, `/vacancies`, `/applications`) fetch its next
page as it scrolls, with the server filtering, sorting and counting. Until now
`/vacancies` loaded the newest 100 rows and never the rest, and `/applications` loaded
the whole pipeline up front, 500 rows a request, by `offset`.

Offset paging is wrong for `/applications`: it orders by `statusChangedAt desc`, and
every status write moves a row to the top, so between two page requests the window
shifts — a row is skipped or shown twice. `/vacancies` sorts by
`recommendation, matchScore`, which is not a single monotonic column. The tables hold
~500–1,200 rows.

## Decision

Each REST list request takes `cursor?: number` — the `id` of the last row the client
has — and `limit`, and returns `{ items, total, nextCursor: number | null }`. Core
pages with Prisma's `cursor: { id }` over the list's own `orderBy`, with `id`
as the last key so the order is total. `total` is the count for the same `where`, not
the page size. `nextCursor` is the last item's `id` when more rows follow, else `null`.

`cursor` is added **beside** `offset`, not instead of it. MCP's `list_vacancies` and
`list_applications` keep `offset` and do not change, so no skill changes. A REST
request that sends both → `400`.

`/vacancies`' order becomes a `sort` param rather than a new default: `newest` (the
default, `createdAt desc, id desc` — what `list_vacancies` promises) or `recommended`
(`recommendation asc, matchScore desc, id desc`), which the web sends.
`recommendation asc` relies on the Postgres enum's declaration order — APPLY,
APPLY_WITH_CAVEATS, SKIP.

The web pages with TanStack `useInfiniteQuery` and the existing `useVirtualRows`: when
the virtualizer reaches the last loaded rows it calls `fetchNextPage()`. One hook
serves the three tables. Optimistic writes patch the `pages[]` shape.

## Why this and not the alternatives

- **Offset.** Skips or repeats rows on `/applications` whenever a status is written
  mid-scroll — the case the page exists for.
- **Hand-written keyset SQL (`WHERE (a, b, id) < (…)`).** Exact, but one predicate per
  sort, and `recommendation, matchScore` needs enum-aware comparison. Prisma's cursor
  works for any `orderBy` at this size.
- **Replacing `offset` in MCP too.** Would change two tool inputs and the skills that
  call them, for clients that read one page at a time and gain nothing.
- **A new default order on `/vacancies`.** `list_vacancies` shares `core`'s `list()`
  and promises "newest first"; a param keeps that promise and lets the web ask for
  its own order.

## Consequences

- A table reaches every row the filter matches, and its footer shows the server's
  `total`.
- Ceiling: when the cursor row itself moves (a status write on `/applications`), the
  next page starts from the row's new place. Every write already invalidates the list,
  and a refetch of an infinite query restarts from the first page, so the window heals
  on the next render.
- No `skip: 1` (the trap phase 4 step 2's core test confirmed): it skips the cursor
  row on the premise that it is in the result, and a cursor row that no longer matches
  the filter (a vacancy triaged out of `NOT_REVIEWED` while `/vacancies` shows that
  filter) is not — so the next real row was dropped. `core/src/db/paging.ts` fetches one
  row more and drops the cursor row itself when it is there.
- Two paging styles live side by side in `core`'s list services.

## What this constrains — breaks if you change it

- **`id` must stay the last `orderBy` key** in every paged list. Without it, rows tied
  on `createdAt` / `statusChangedAt` / `matchScore` have no fixed order, and Prisma's
  cursor skips or repeats them at a page boundary — silently.
- **`total` must keep meaning "rows matching the filter".** The footers read it (the
  dashboard no longer does — it reads `GET /stats`, [ADR-0031](0031-stats-endpoint.md)).
- **Removing `offset` from `list()`** breaks `list_vacancies` / `list_applications`
  and the skills that page with them.
- **`sort=recommended` depends on the enum's declaration order** in
  `packages/core/prisma/schema.prisma`. Reordering `Recommendation` reorders the web's
  `/vacancies` without an error. Postgres sorts an enum by creation order, and
  `ADD VALUE` appends — so APPLY_WITH_CAVEATS, added after SKIP, sorted last until
  migration `20260928120000_recommendation_enum_order` rebuilt the type. A new value
  goes in with `ADD VALUE … BEFORE`/`AFTER`.
- **An optimistic write that patches only `data` and not `data.pages[]`** leaves the
  table showing the old status until the refetch.

## Related

- [ADR-0025](0025-vacancies-list-search-server-side.md) — server-side search and what
  `total` means.
- [ADR-0011](0011-web-tanstack-query.md) — the query cache the infinite queries live in.
- [`../phases/phase-4.md`](../phases/phase-4.md) § Paging — the work this records.
- [`../contracts.md`](../contracts.md) — the `cursor`, `sort` and `nextCursor` params.
