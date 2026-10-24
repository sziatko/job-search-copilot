# 0030 — Every list pages by a Prisma cursor

- Status: Accepted · Date: 2026-09 · Revised 2026-10: MCP's `offset` went too

## Context
Every web table fetches its next page as it scrolls, with the server filtering,
sorting and counting. Offset paging is wrong for `/applications`: it orders by
`statusChangedAt desc`, and every status write moves a row to the top, so between two
page requests the window shifts — a row skipped or shown twice. `/vacancies` sorts by
`recommendation, matchScore`, not one monotonic column. An agent paging through the
queue has the same problem: each analysis it writes takes a row out of `NEW`, and the
next offset skips one.

## Decision
A list — REST and the MCP tools `list_vacancies` / `list_applications` alike — takes
`cursor?` (the `id` of the last row the client has: the previous page's `nextCursor`)
and `limit`, and answers `{ items, total, nextCursor: number | null }`. Core pages with
Prisma's `cursor: { id }` over the list's own `orderBy`, with `id` as the last key so
the order is total (`cursorArgs` / `toCursorPage` in `packages/core/src/db/paging.ts`).
`total` is the count for the same `where`; `nextCursor` is the last item's `id` when
more rows follow. There is no `offset`.

`/vacancies`' order is a `sort` param: `newest` (default, `createdAt desc, id desc`,
what `list_vacancies` promises) or `recommended` (`recommendation asc, matchScore
desc, id desc`, the unanalysed last), which the web sends. `recommendation asc` is the
Postgres enum's order: APPLY, APPLY_WITH_CAVEATS, SKIP.

The web pages with `useInfiniteQuery` (`useInfiniteList`) and `useVirtualRows`: near
the last loaded row, the table calls `loadMore`.

## Why this and not the alternatives
- **Offset** — skips or repeats rows whenever a status is written mid-scroll, or an
  agent's own writes move rows out of its filter.
- **Offset beside the cursor for MCP** (as until 2026-10) — two schemes on one list, a
  `400` for asking both, and a skill told to read the whole list before writing so its
  own writes would not shift the offset.
- **Hand-written keyset SQL** (`WHERE (a, b, id) < (…)`) — exact, but one predicate
  per sort, and an enum-aware comparison for `recommended`. Prisma's cursor does any
  `orderBy` at this size.

## Consequences
- A table reaches every row its filter matches; its count is the server's `total`.
- An agent can write between pages: the cursor is a row, not a position.
- When the cursor row itself moves (a status write), the next page starts from its new
  place. Every write invalidates the web's list, and a refetch restarts from page one,
  so the window heals.
- **No `skip: 1`.** It assumes the cursor row is in the result, and a cursor row that
  left the filter (a vacancy triaged out of `NOT_REVIEWED`) is not, so the next real
  row was dropped. `paging.ts` fetches one row more and drops the cursor row itself
  when it is there. And Prisma pages a nullable `orderBy` (`recommendation`) in memory
  from the cursor row, finding nothing once that row left the filter — so `list()`
  keeps the cursor row in its `where` (`OR id = cursor`).

## What this constrains — breaks if you change it
- **`id` must stay the last `orderBy` key** in every paged list, or ties skip or repeat
  at a page boundary, silently.
- **`total` must mean "rows matching the filter"** — the tables' counts read it.
- **A skill that pages** passes `nextCursor` back as `cursor`; a renamed field breaks
  it (the `vacancy-evaluator` skill).
- **`sort=recommended` depends on the enum's declaration order.** Postgres sorts an
  enum by creation order, and `ADD VALUE` appends: a new value goes in with
  `ADD VALUE … BEFORE` / `AFTER`.
- **An optimistic write patching `data` but not `data.pages[]`** leaves the old status
  on screen until the refetch.

## Related
[ADR-0025](0025-vacancies-list-search-server-side.md), [ADR-0011](0011-web-tanstack-query.md),
[`../contracts.md`](../contracts.md).
