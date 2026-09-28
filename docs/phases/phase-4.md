# Phase 4: every table scrolls; the log, the dashboard and one vacancy on real data

## Goal

For the web. Core and REST grow what the web needs; the MCP tools and the skills do not
change. Four items from [`../backlog.md`](../backlog.md):

- **Infinite scroll on every table** — `/log`, `/vacancies`, `/applications`. The
  server filters, sorts and counts; the web fetches the next page as the table scrolls.
- **`/log`** — the `VacancyLogEntry` table in the web: a table with a search box. The
  search box is the whole "form"; there is no add-entry form.
- **The dashboard on real data** — the funnel and the KPIs counted from the
  `StatusChange` journal ("ever reached this stage"), not from each vacancy's current
  status.
- **A page for one vacancy** — `/vacancies/$id`: the posting text, the status timeline,
  the comments, the company's other vacancies, and actions.

Not in this phase (they stay in the backlog): the timeout stored in the DB, comment
edit / delete, the mockup's Source / Status / Score / Note columns on the log (nothing
stores them).

## Paging: Prisma cursor paging

Each list request takes `cursor?: number` (the `id` of the last row the client has)
and `limit`, and returns `{ items, total, nextCursor: number | null }`. Core pages with
`cursor: { id }` over the table's own `orderBy` (`paging.ts` — no `skip: 1`, see ADR-0030),
with `id` as the last key so the order is total. `total` is the count for the same `where`.

- Why not offset: `/applications` orders by `statusChangedAt`, which every status write
  changes, so an offset window skips or repeats rows.
- Why not hand-written keyset SQL (`WHERE (a, b, id) < (…)`): Prisma's cursor works for
  any `orderBy`, including `/vacancies`' `recommendation, matchScore`. Hand SQL per sort
  is not worth it at ~500–1,200 rows.
- Ceiling: when the cursor row itself moves (a status write on `/applications`), the
  next page starts from its new place. Every write already invalidates the list, and a
  refetch of an infinite query starts again from the first page, so the window heals.

- MCP keeps `offset`. `cursor` is added beside it, not instead of it: `list_vacancies`
  and `list_applications` page by `offset` and stay untouched, so no skill changes.
  Both given → a 400.
- `/vacancies`' order is a `sort` param, not a new default: `sort=newest` (the default,
  `createdAt desc, id desc` — what MCP's `list_vacancies` promises, "newest first") or
  `sort=recommended` (`recommendation asc, matchScore desc, id desc`), which the web sends.

Web: TanStack `useInfiniteQuery` + the existing `useVirtualRows`. When the virtualizer
reaches the last loaded rows, `fetchNextPage()`. One shared hook for the three tables.
The optimistic writes in `useVacancies` / `useApplications` patch the `pages[]` shape.

## Stats: one endpoint

`GET /api/v1/stats`, computed in core in SQL. The dashboard and the `/applications` KPI
strip read it; neither loads a whole list anymore.

| Field | Meaning |
| --- | --- |
| `logged` | `VacancyLogEntry` count |
| `analysed` | vacancies with an `ANALYZER` comment |
| `awaitingTriage` | `status = NOT_REVIEWED` |
| `recommended` | `recommendation in (APPLY, APPLY_WITH_CAVEATS)` |
| `applied` | vacancies with an `APPLIED` journal row, ever |
| `responded` | … with a `REPLIED`, `RECRUITER_SCREEN`, `INTERVIEW` or `OFFER` row, ever |
| `interview` | … with an `INTERVIEW` or `OFFER` row, ever |
| `recruiterScreen` | … currently in `RECRUITER_SCREEN` |
| `pipeline` | the `/applications` strip: `byStatus` (current), `active`, `timedOut`, `total` |
| `recent` | the 6 latest pipeline `StatusChange` rows (triage moves left out), with company and title |

The funnel is Logged → Analysed → Applied → Got a response → Interview.

## Timeout rule moves to core

Still derived (ADR-0022), still 30 days, but computed in core: an `/applications` list
item carries `timedOut: boolean`, the list takes the Active / Timeout filters, and
`stats.pipeline` counts them. The web drops `isTimedOut` / `isActive` / `TIMEOUT_DAYS`
(invariant 5: the web cannot import core, so the server sends the answer).

Why now: with infinite scroll the Timeout filter must find rows the browser has not
loaded, so the rule has to be server-side anyway. Step 3 moves it (for
`stats.pipeline`); step 4 reuses it for the filter and the per-item flag.

A stored timeout written by a daily job stays in the backlog. Once web, API and MCP read
`timedOut` from core, that job changes one place in core — a stored field instead of
`statusChangedAt < now − 30 days`. It never writes `status` (invariant 3).

## Status

- [x] **0 · Docs.** ADR-0030 (cursor paging), ADR-0031 (the stats endpoint, the funnel
  from the journal). Update `contracts.md` for the new query params and endpoints.
  The backlog rows are already marked `planned (phase 4)`; the phase doc links from `docs/README.md`.
  — *2026-09-28.* `contracts.md` marks each not-yet-built param / row
  **(phase 4 step N)**; the step that builds it removes its mark. Step 2: ADR-0030
  flags that `skip: 1` may drop a row when the cursor row no longer matches the filter
  — the planned test decides. Step 3: update ADR-0022 and `domain-model.md` (timeout
  now in core) and the dashboard line in contracts' `total` note. Step 4 names the
  Active / Timeout query param.

- [x] **1 · `/log` with infinite scroll.**
  - **Core.** `VacancyLogService.list({ search?, cursor?, limit })`, ordered
    `createdAt desc, id desc`; `search` matches company, title or url
    (`escapeLikePattern`).
  - **REST.** `GET /api/v1/log?q=&cursor=&limit=`.
  - **Web.** The shared infinite hook (`useInfiniteQuery` + `useVirtualRows`, next page
    near the end). `LogPage`: a `SearchInput` (in the URL, like `/vacancies`' `q`) and a
    table — Seen / Company / Title / URL — styled like `/applications`. `SoonPage` goes
    from here.
  - **Tests.** core: order, search, cursor pages without gaps or repeats — including
    rows tied on `createdAt`; e2e; web: the page renders, searches, loads the next
    page (MSW).
  — *2026-09-28.* The "shared hook" is two pieces, because the tables own their
  scroll box and the pages own the data: `lib/useInfiniteList` (the query, flattened
  `items`, `total`, `loadMore`) and a third `onEndReached` argument on
  `useVirtualRows` — steps 2 and 4 pass `loadMore` through the table as a prop. The
  page schema is `cursorPageSchema(item)` in `lib/api.ts`. The web test scrolls by
  defining `scrollTop` on the scroll box and firing `scroll` (`LogPage.test.tsx`);
  MSW's `logHandler` is the cursor fake to copy.

- [x] **2 · `/vacancies` with infinite scroll.**
  - **Core / REST.** `VacancyService.list` takes `cursor` and `sort` (see Paging);
    `GET /vacancies` passes both. `sort=recommended` relies on the Postgres enum order
    — APPLY, APPLY_WITH_CAVEATS, SKIP, the declaration order. The DB had it as APPLY,
    SKIP, APPLY_WITH_CAVEATS (`ADD VALUE` appends), so this step carries the phase's one
    migration, `20260928120000_recommendation_enum_order`, which rebuilds the type.
    MCP's `list_vacancies` is unchanged (its output stays `{ items, total }`).
  - **Web.** The status filter goes to the server (`status[]`, Applied = every pipeline
    status) and into the URL; the client-side filter and sort go. The footer shows the
    server's `total`. The optimistic status write patches `pages[]`.
  - **Tests.** core: both sorts, cursor, the default is still newest first, and a
    cursor row that no longer matches the filter (triaged out of `NOT_REVIEWED`) still
    pages; web: filter → request, next page, optimistic write.
  — *2026-09-28.* Migration `20260928120000_recommendation_enum_order` must be applied
  to the dev DB (`docker compose restart api mcp` after); only the test DB has it. The
  paging helpers are `cursorArgs` / `toCursorPage` in `core/src/paging.ts` — step 4's
  `ApplicationService.list` uses them (a row moved out of a status filter is the same
  trap). `/vacancies`' URL now carries `status` (absent = NOT_REVIEWED).

- [x] **3 · `GET /api/v1/stats` and the dashboard.**
  - **Core.** `StatsService.get()` — the table above, in SQL over `StatusChange`.
    `analysed` is `hasAnalysis`' rule (an `ANALYZER` comment), counted. The timeout
    rule moves here (`TIMEOUT_DAYS` in core), so `stats.pipeline` is complete —
    `byStatus`, `active`, `timedOut`, `total`.
  - **Web.** A hand-written zod schema for `/stats` (invariant 5). The dashboard reads
    `/stats` only: the funnel, the KPIs, Recent activity from `recent`. The review
    queue is `GET /vacancies?status=NOT_REVIEWED&sort=recommended&limit=5`.
    `dashboard/api.ts`'s four count requests go.
  - **Tests.** core: a vacancy that got a reply and was then rejected still counts in
    `responded`; `timedOut` at the 30-day boundary; e2e; web: the funnel labels and
    conversions.
  — *2026-09-28.* The rule is `timedOutWhere(now)` / `OPEN_PIPELINE_STATUSES` in
  `core/src/status.ts` — step 4's filter and flag reuse it. It is
  `statusChangedAt < now − 30 days`; the web mirror step 4 deletes is
  `floor(days) > 30`, so the two disagree for rows 30–31 days old until then. Nothing
  invalidates `['stats']` yet (a write shows on the dashboard after the 30 s
  `staleTime`); step 4's "a status write invalidates the stats" is that key. Web
  fakes: `fakeStats` / `statsHandler` in MSW's `handlers.ts`, not part of
  `buildHandlers` — a test that renders `/` adds it. The first KPI tile is now
  Logged (Postings is gone).

- [x] **4 · `/applications` with infinite scroll.**
  - **Core.** `ApplicationService.list` takes `cursor` and the Active / Timeout filter
    — `state=active|timedOut`, beside `status`, ANDed with it (step 3's rule); each
    item carries `timedOut`. MCP's `list_applications` keeps `offset` and gains no
    filter.
  - **Web.** Search and the status filter go to the server. The KPI strip reads
    `stats.pipeline`. `listApplications`' 500-row loop goes. The optimistic writes patch
    `pages[]`; a status write invalidates the list and the stats.
  - **Tests.** core: the Active / Timeout filters, cursor; web: the strip, a filter,
    the next page, an optimistic move.
  — *2026-09-28.* `timedOut` is on **every** `ApplicationListItem` (computed in core's
  `flatten`, so `GET /:id`, both PATCHes, POST and MCP's `list_applications` items carry
  it) — the web schema has it required, not `.optional()`. `CompanyHistoryModal` lost
  the tracker's whole-list cache: it reads `GET /applications?search=<company>&limit=500`
  under its own key `['application-company', company]` — keep it off the
  `['applications']` prefix, whose entries the optimistic writes patch as `pages[]`.
  `['stats']` is now invalidated by every status write and by applying on `/vacancies`.

- [x] **5 · The vacancy page `/vacancies/$id`.** The mockup is
  `docs/design/vacancy-detail-reference.html` (styled after `dashboard-reference_2.html`).
  - **Core / REST.** `GET /vacancies/:id` adds `timeline: { status, createdAt }[]` from
    `StatusChange`, oldest first — in core's `getById` / `updateStatus`, so the PATCH and
    MCP's `get_vacancy` carry it too (its description says so; no skill reads it). The
    other vacancies come from `GET /vacancies?company=` (what `CompanyHistoryModal`
    already uses, under the same `['vacancy-company', company]` key).
  - **Web.** Header (company, title, score, recommendation, apply link); `fullText`, or a
    placeholder when it is the importer's (`N/A`); the timeline; the comments (the
    mockup's history list); the facts; the company's other vacancies; actions — change
    status (before `APPLIED` as on `/vacancies`, after as on `/applications`) and add a
    comment (`PATCH /applications/:id` with `comment`). Not optimistic: one record, the
    control waits for the server. The **title stays a link to the posting** in every
    table (the common click); the page is a separate "→" `DetailsLink` in the Action
    column of `/vacancies` and `/applications` and in the page's other-vacancies table.
    The dashboard's review queue and recent activity link here.
  - **Tests.** core: the timeline; web: each block, a missing `fullText`, a status move.
  — *2026-09-28.* `addComment` does not parse the PATCH response: it is the
  application shape, whose web schema refuses a triage status. Every write on the
  page, `/vacancies` and `/applications` invalidates `['vacancy']`. The comment
  schema now lives in `vacancies/types.ts` (`applications/types.ts` imports it — the
  reverse would be an import cycle). MSW's `buildHandlers` serves `GET /vacancies/:id`
  and journals `timeline` in `moveTo`.
