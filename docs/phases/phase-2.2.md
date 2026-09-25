# Phase 2.2 — the review's findings

A phase of its own, but not a feature: a code review over phase 2.1's diff
(`HEAD~5..HEAD`) reported 15 findings and this phase fixes them. Planned before
implementing, per [`../README.md`](../README.md).

## Goal

The app stops making claims it cannot back. Every finding below is a claim the
screen or the server made that the data behind it did not support: a search term
that means "match everything", a modal that counts one page as if it were the log,
a green toast on a failed write, a row painted `0%` for a posting that was never
scored. The fixes are small; what they have in common is that the wrongness was
invisible to the suite that passed over them.

## Triage

Every finding was re-verified against the code before planning — and again on
2026-09-24 while writing this doc. **C\*** = confirmed from pattern semantics
(reasoned, not measured — no such row exists in the dev DB). Four statements in
the original review did not survive intact; they are corrected in the rows.

| # | Finding | Where |
| --- | --- | --- |
| 5 | `search` / `company` / `title` reach Prisma `contains` unescaped, so `%` and `_` are wildcards. The review missed that `application.service.ts` has the same bug | `packages/core/src/estimated-vacancy.service.ts:107-125`, `application.service.ts:108-127` |
| 12 | A company name containing `\` drops out of its own prefilter, so `companyMatchCount` returns 0 and the duplicates button hides. The comment claiming this "can never under-select" is false | `estimated-vacancy.service.ts:157-170` |
| 2 | The modal's Action column reads `Not applied` for every row when the applications query **failed** — `isError` is consulted nowhere in `apps/web/src` (zero occurrences) | `pages/vacancies/components/CompanyHistoryModal.tsx:41,124` |
| 1 | A failed `POST /applications` still fires `toast.success`; the dialog is unmounted, so the typed details are unrecoverable. `applyMutation` has no `onSuccess` — nothing ever reads the response | `pages/vacancies/VacanciesPage.tsx:101-104`, `useVacancies.ts:144-181` |
| 3 | The optimistic write patches the exact search-scoped key while the cache entry in the `keepPreviousData` window is **absent** — so neither the patch nor the rollback happens (`setQueryData` early-returns on `undefined`). The code comment at 35-38 blaming a prefix mismatch is wrong: `cancelQueries` does prefix-match; the differing element is a primitive so it is harmless either way | `useVacancies.ts:35-38,39,74-84,86-117` |
| 4 | `q` is `z.string()` but the router JSON-parses query values, so `/vacancies?q=2024` throws out of `validateSearch`; with no `errorComponent` anywhere, "Something went wrong!" replaces the page. `/tracker` shares the shape and is stricter about `status` | `router.tsx:58-69,88-100` |
| 10 | The term is never trimmed below the URL, so `" eng"` matches nothing while the box still shows it. Trimming on write would break typing (the input re-syncs from the URL) | `useVacancies.ts:29-33`, `pages/vacancies/api.ts:31`, the DTO, `useApplications.ts:23-27` |
| 8 | The modal's subtitle counts the fetched page, not `data.total` — a 250-vacancy company reads "100 in the log" under a badge saying "249 other vacancies" | `components/CompanyHistoryModal.tsx:37,53-55` |
| 9 | The join comes from one `limit=500` fetch with no paging, and the server orders `appliedAt desc` — so the rows missing are the **oldest** applications, exactly the history the modal answers for. The same cap makes `/tracker`'s status filter ignore rows past 500 | `pages/applications/api.ts:21-26` |
| 11 | No explicit "analysed" signal exists anywhere. Three consumers infer it three ways (URL scheme, an unguarded `matchScore`, a raw row count) | `components/CompanyHistoryModal.tsx:120` + `:80`, `components/VacancyTable.tsx:115`, `pages/dashboard/api.ts:22-30` |
| 6 | `⋯` re-click cannot close its own menu: every click calls `showPopover()`, and the UA's pointerup light-dismiss is undone by the same click | `components/RowActionMenu.tsx:33-44,60` |
| 7 | `role="menu"` / `role="menuitem"` without the arrow-key contract they announce | `components/RowActionMenu.tsx:66-68` |
| 13 | `timeAgo` throws `RangeError` on an unparseable `statusUpdatedAt`; no error boundary exists, so one bad stamp takes out the dashboard render. The sibling `daysSinceLastMove` fails open and is pinned by a test | `pages/dashboard/DashboardPage.tsx:25-30` |
| 14 | The button-vs-menu split is hand-encoded in **two** places (`MENU_ACTIONS` and two literal buttons), with nothing type-level tying either to the four-value union — a fifth status ships with no control anywhere. The split is *not* in `constants.ts` today | `components/RowActionMenu.tsx:7`, `components/VacancyTable.tsx:142-159` |
| 15 | `CLAUDE.md` says 23 ADRs; there are 25 | `CLAUDE.md:13` |

## Scope

1. **Escape what the user typed** before it becomes a LIKE pattern, everywhere.
2. **The log loads whole**, in a stable order.
3. **The modal stops claiming what it cannot back** — both numbers, and no
   `Not applied` it has not read.
4. **A failed apply stops reporting success.**
5. **`⋯` closes on a second click**, through the platform's own mechanism.
6. **The optimistic write survives a missing cache entry.**
7. **One place decides whether a vacancy was analysed.**
8. Four small corrections: a JSON-parsed query value, a throwing date formatter,
   the button-vs-menu split, and a stale ADR count.

Out of scope: `/tracker`'s status `<select>`, server-side paging or a server-side
status filter for `/tracker`, MCP parity changes, and the sidebar's six native
tooltips.

## New surfaces

- `EstimatedVacancyListItem.hasAnalysis: boolean` — derived in `core`, no column,
  no migration. Rides into **both** transports (`list()` feeds `apps/api` and
  `apps/mcp` alike) and must be `.optional()` in the web schema, because that same
  schema parses the `PATCH .../user-action` response
  ([ADR-0025](../decisions/0025-vacancies-list-search-server-side.md) — the
  `companyMatchCount` precedent).
- `packages/core/src/like.ts` — `escapeLikePattern()`. One helper, no config.
- The web's applications list becomes `N` serial requests of 500 rows instead of
  one truncated `limit=500` request. No REST surface changes; `total` keeps its
  meaning ("rows matching the filter").

## Decisions introduced this phase

No new ADR. None of the four decisions below moves a boundary or a contract, and
[`../decisions/README.md`](../decisions/README.md) sends the small ones to a
section in the phase doc instead. `hasAnalysis` **does** change the list-item
contract, so [`../contracts.md`](../contracts.md) is updated where it lands (step 7).

1. **"Analysed" becomes one derived field in `core`** — no DB column, no migration.
   It is derived from the placeholder sentinel `estimationComment: 'N/A'`, whose
   only writer is `ApplicationService.resolveVacancyId`'s create path
   (`application.service.ts:290,293` — the importer reaches it through
   `recordMany`, it does not write the sentinel itself). Ceiling named at the
   derivation: a row whose real analysis happened to be commented exactly `N/A`
   would read as unanalysed.
2. **The `⋯` menu gets only the click-to-close fix now.** Arrow keys and the
   `role="menu"` contract are deferred, recorded below so they cannot rot into
   "done".
3. **`listApplications` pages the whole log** rather than keeping the 500 cap. It
   is the only client-side reader of that endpoint, and the cap silently drops the
   oldest rows.
4. **A failed apply moves the toast into `onSuccess`**; the dialog closes as now.

## Status

Each step is independently completable, carries its own tests, and leaves
`npm test`, `npm run lint`, `npm run typecheck` green. Core steps rebuild `dist`
first ([ADR-0015](../decisions/0015-testing-strategy.md)).

- [x] **0 · this doc and its index row.** 2026-09-24. No code.
- [x] **1 · the search term means what it says** (5, 12, 10). 2026-09-24. As planned,
  with two divergences the next steps need:

  1. **The trim lives in the hook, not in `api.ts`.** `useVacancies` now returns `q`
     (the raw URL value — the box re-syncs from it, so trimming *it* eats a space
     mid-word) and derives `term = q.trim()`, which is both the cache key element and
     the request's `search`. `pages/vacancies/api.ts` is untouched; the plan named its
     line 31 as the trim site, but the key needs the same value and the hook is the
     only place that has both, so the choke point moved up one level.
  2. **The tracker's client-side filter trims its own needle** (`useApplications`:
     `q.trim().toLowerCase()`) — `q` stays raw there too.

  `escapeLikePattern` (new `packages/core/src/like.ts`) is applied at all **seven**
  `contains` sites: the vacancy service's `search` (both OR arms), `company`, `title`
  and the `companyMatchCount` prefilter, plus the application service's three.
  **Adding it to `index.ts` needs Biome's alphabetized export order** — the first
  attempt failed `npm run lint` with the function before `./estimated-vacancy.service`.

  Tests: 4 core cases in `estimated-vacancy.service.spec.ts` (`%`, `_`, `\`, and the
  prefilter on a company named `A\B`), 1 in `application.service.spec.ts` (the same
  three metacharacters through the join), 1 api e2e case (`?search=%25` matches
  nothing), 1 page case (a padded term arrives trimmed while the box keeps the
  padding). Suite **299 → 306**, 18 files. `escapeLikePattern` is not unit-tested on
  its own — the DB round-trip is what proves it.

  Verified against Postgres directly rather than by reading the docs: `'AB' ILIKE
  '%A\B%'` is **true** while `'A\B' ILIKE '%A\B%'` is **false**, so the `\` case did
  fail before the fix, and it is the prefilter's under-selection (finding 12) that the
  psql check reproduces.
- [x] **2 · the log loads whole, in a stable order** (9). 2026-09-24. As planned,
  with the loop's ending conditions doing more than the plan's wording:

  "A short page" and "`items.length >= total`" are the two real stops; a page budget
  that runs out **throws** (`still paging after 200 pages`). That is one `exhausted`
  flag set by those two conditions rather than a third "hit 200" check — every other
  way out of the loop is the runaway case by definition, which is what keeps a quiet
  stop from reaching the return. `total` is re-read per page and returned as
  `Math.max(total, items.length)`: a row deleted mid-load shrinks the server's count
  under a list that already holds more, and the footer's `X ≤ Y` is a test assertion.

  Tests: new `apps/web/src/pages/applications/api.test.ts`, 5 cases (one request under
  500; offsets `0/500/1000` each carrying `limit=500`; an empty page ending a load
  whose `total` claims 5000; a shifting window dropping the re-served row; the runaway
  server throwing after exactly 200 requests). Plus the core tie case in
  `application.service.spec.ts`. Suite **306 → 312**, 19 files.

  **Two fixture landmines, both hit while writing them.** A "server that never ends"
  fake must serve a *full* page forever (the first one ran out of rows, so the loop
  stopped on a short page and nothing threw) **and** hand out fresh ids per page, or
  the dedupe swallows them and `items.length >= total` reads true. And
  `buildApplicationHandlers` now sorts by `appliedAt desc, id desc` and slices by
  `limit`/`offset` like the real endpoint — without that the loop is not exercised at
  all, which is exactly how it passed review while truncated.
- [x] **3 · the modal stops claiming what it can't back** (8, 2). 2026-09-24. As
  planned, and it broke a test that was passing for the wrong reason:

  `logUnknown = applications.isPending || applications.isError` is one flag read by
  both the Action cell and the ⏳, so they cannot disagree. The subtitle reads
  `data.total` and switches to `Showing 100 of 101 vacancies, newest first` only when
  the page is short.

  **The pre-existing test it broke is the finding.** `shows — instead of a score for
  a vacancy with no usable applyURL` asserted `getAllByText('—')).toHaveLength(1)` and
  two `Not applied` cells — and its `/applications` request was *unhandled*, so the
  log had failed and those two claims were false. It now registers
  `buildApplicationHandlers([])` and keeps asserting what it is about (the importer
  row's score). Anyone re-reading that file: an unhandled request under
  `onUnhandledRequest: 'error'` is an `isError` query, not a missing one.

  Tests: 2 new in the modal describe — a failing applications fake claiming neither
  `Applied` nor `Not applied` with the failure line named, and `limit=100` against
  101 rows reading both numbers. Suite **312 → 314**, 19 files.
- [x] **4 · a failed apply stops reporting success** (1). 2026-09-24. As planned.

  The toast is now `applyMutation.onSuccess` in `useVacancies.ts`; `VacanciesPage`'s
  `onConfirm` is just `confirmApply`. The server's message reaches the row through a
  new `errorMessage(res, fallback)` in `apps/web/src/lib/api.ts` — the sibling of
  `parseResponse`, and only `recordApplication` calls it. `apps/api`'s
  `DomainExceptionFilter` sends `{ statusCode, error, message }`, so a 422 now reads
  "Already recorded." instead of "Failed to record application: HTTP 422".

  Tests: one new in `useVacancies.test.ts` (failure ⇒ the server's line on the row,
  the tag back to `Not reviewed`, **no** success toast) plus the missing other half
  added to the existing happy path (`success` called with `Application submitted!`) —
  without it, deleting `onSuccess` would leave the suite green. Both assert against
  `vi.spyOn(toast, 'success')`, because the `Toaster` is mounted in `main.tsx` and no
  route test renders it; the file gained `afterEach(() => vi.restoreAllMocks())` so a
  spy cannot outlive its test. Suite **314 → 315**, 19 files.
- [x] **5 · `⋯` closes on a second click** (6). 2026-09-24. Landed as planned, so
  the mechanism notes below are the plan's, and one thing it left open is closed:

  The trigger is now `popoverTarget={menuId}` with **no** `onClick`, and the menu
  carries that `id` (`useId`, per row instance — the component had no id before, so
  "only the clicked row's menu opens" is a new guarantee, not a preserved one).
  Positioning moved into `onBeforeToggle`; `newState !== 'open'` is the guard, since
  the event fires for hide as well. **`position-area: none` is not needed** — the
  plan's fallback for Chrome's default popover anchoring; the measured box is exact,
  so it stays out until something measures otherwise.

  The jsdom stub learned the invoker: a document-level click listener that toggles
  the target and fires `beforetoggle` first, because the app positions itself in that
  event — a stub jumping straight to `showPopover()` would leave every menu at
  `top: 0` and prove nothing. Its comment now says jsdom 30 has **no** Popover API
  (the old one claimed a partial implementation; `typeof el.showPopover` is
  `undefined`).

  Tests: three in `useVacancies.test.ts` — the second click closing, the third
  re-opening; the measurement being taken per open (the trigger's rect is moved
  between opens, so a cached position fails); and only the clicked row's menu being
  open, asserted by `popovertarget` equalling the open menu's `id`.

  **Browser pass, real CDP input** (`%TEMP%/jsc-browser/probe-step5-toggle.mjs` — a
  new driver script, because `cdp.mjs` can only hover and this claim needs clicks: a
  page-JS `.click()` runs no light dismiss and so cannot test a toggle). 1440×900,
  first row's trigger: closed on load (`display: none`, `:popover-open` false, 0 open);
  click 1 → `flex`, `:popover-open` true, box `[.., 258]` = `trigger.bottom + 4`, right
  edge 1372 = the trigger's right, 4px gap, exactly one open menu whose id is the
  trigger's `popovertarget`, 19 triggers all invokers; click 2 → `display: none`,
  nothing open; click 3 → open again at the same coordinates; a click on the shell's
  `<h1>` → closed (light dismiss survives the invoker); **Escape** → closed; a real
  wheel over `.table-body-scroll` → closed (the app's own listener, not the UA's).

  **One thing to know about the pass itself:** an outside click at `x=12` lands on the
  sidebar and *navigates* — the probe's next reads then describe `/tracker`, which has
  no ⋯ at all. The inert target is the shell's `<h1>`. And the dev page needs **8s**
  to settle, not 4: a cold vite server re-optimizes deps and reloads mid-flight, and
  the probe reads an empty `#root` that means "not yet".

  One flake, unresolved: a full `npm test` in this step reported 1 failure in one file
  and two subsequent full runs were clean (318/318, exit 0). Not reproduced, so not
  diagnosed — if it recurs, start here rather than at the step-5 tests.
- [x] **6 · the optimistic write survives a missing entry** (3). 2026-09-24. The
  code landed as planned; **one of this step's two claims was false, and measuring
  it is most of what this step now knows.**

  Refuted: *"patching the old key is visible, because `keepPreviousData` re-reads
  that query's live cache entry."* It does not. `@tanstack/query-core`'s
  `queryObserver.js` freezes the placeholder — once `prevResult.isPlaceholderData`
  is true and the `placeholderData` option is the same object, `placeholderData =
  prevResult.data`, i.e. the value from when the placeholder was first applied. So
  while the new term is pending, **nothing written into the cache changes the rows on
  screen**, and no re-render (the `savingIds` state change included) re-reads the
  entry underneath. Measured: the old entry held `READY_TO_APPLY` while the row
  still read `Not reviewed`.

  What the change therefore buys, and what the tests now assert: the optimistic
  write lands on **the entry that exists** instead of vanishing into one that does
  not, and the rollback has a snapshot to restore — `setQueriesData` / `getQueriesData`
  over the `VACANCIES_KEY` prefix, with one `restorePages(snapshot)` helper shared by
  both mutations. It is *not* a visible improvement, and the comment in
  `useVacancies.ts` says so, because a future reader "optimising" the prefix write
  back to one key would otherwise be told it restores a visible behaviour it never had.

  Tests: two, both holding requests open with a test-owned gate (`holdTermRequest`
  for the list, a second `gate()` for the PATCH — the only gate primitive in the web
  suite; the others widen windows with `delay()`). A asserts the patched value is in
  the old entry while the term's own key is still `undefined`; B holds the PATCH,
  asserts the optimistic value is *in* the cache mid-flight, then fails it and asserts
  the entry is restored — without the hold, "restored" and "never written" are the
  same observation. Suite **318 → 320**, 19 files.

  `buildHandlers`' list logic moved into an exported `estimatedVacanciesResolver`, so
  the gate wrapper *delegates* to the fake instead of re-implementing it — and so
  handler order stops mattering. Two MSW facts this step needed, both verified:
  `use()` prepends, so a **later** `use()` call wins but within one call the **first**
  entry wins (a 500 override in the same call as `buildHandlers` loses to its PATCH);
  and `passthrough()` is not "try the next handler" — it performs the **real**
  request, which here would hit the dev API on :3000.
- [x] **7 · one place decides whether a vacancy was analysed** (11). 2026-09-24.

  `hasAnalysis: boolean` on `EstimatedVacancyListItem`, derived in the private helper
  that already derived `companyMatchCount` — renamed **`withDerivedFields`**, since one
  name for two fields beats a name that is now wrong. The sentinel it compares against
  moved into a new `packages/core/src/placeholder.ts` (`PLACEHOLDER_COMMENT`), which
  the two writers in `ApplicationService.resolveVacancyId` and the importer's `--reset`
  sweep now import instead of spelling `'N/A'` in three places.

  Web: `.optional()` in `estimatedVacancyListItemSchema` (the ADR-0025 trap — that same
  schema parses the PATCH response). `VacancyTable`'s Score cell and the modal's both
  read it now, so a placeholder reads `—` in both, and `isSafeExternalUrl` is back to
  gating links alone. **`undefined` counts as "no analysis"** on the web side
  (`item.hasAnalysis ? pill : '—'`): an unknown must not become a claim, which is the
  whole phase.

  Dashboard: `counts.analyzed` → **`counts.postings`**, the tile relabelled
  "Postings / in the database, deduped by URL", the funnel's first step "Postings" and
  its subtitle "From posting to interview". Copy and a field name — no test pins the
  wording, and the honest fix (a `hasAnalysis` list filter) is deferred.

  `estimatedVacanciesResolver` derives `hasAnalysis` the way the endpoint does, so a
  fixture becomes a placeholder by carrying the sentinel — which is what made the
  modal's importer fixture honest: it had been a `tracker://` row *with* a real
  comment, passing its dash off the URL scheme. `docs/contracts.md`'s list-item bullet
  now names both derived fields and this fake.

  Tests: 2 core cases (a saved row ⇒ true; a `record()`-created placeholder ⇒ false,
  asserted through the service that writes the sentinel rather than a literal this spec
  shares) and 1 page case (placeholder `—`, analysed row keeps its `80%`). Suite
  **320 → 323**, 19 files.
- [x] **8 · the small corrections** (4, 13, 14, 15). 2026-09-24.

All nine steps landed in **one session** on 2026-09-24, at the user's explicit
instruction, so this phase's "one step per session" was overridden — the phase doc's
own cost rule (clear the context between steps) was traded for finishing the phase.
The evidence per step is the same either way: a full `npm test` green in the session
that made the change, with `lint` and `typecheck` clean, and the two claims a suite
cannot make were measured in a real browser — the `⋯` menu's second-click close, and
the search box against the live database.

Two of the plan's own load-bearing claims did not survive measurement and are
corrected in their steps: keepPreviousData does **not** re-read a patched entry
(step 6), and the modal's importer test had been passing off the URL scheme rather
than the analysis sentinel (step 7).

  - **4 · the URL schemas.** One `termSchema = z.coerce.string().optional()` and one
    `statusFilterSchema = applicationStatusFilterSchema.optional().catch(undefined)`,
    both routes reading them. `status` does not coerce: no coercion makes `BOGUS` a
    status, so junk falls back to what an absent value means. **Verified by
    temporarily restoring the strict schemas** — both new `router.test.tsx` cases then
    fail — so the router really does hand `validateSearch` a JSON-parsed number, which
    was the whole finding.
  - **13 · `timeAgo`** returns `'unknown'` when `elapsed` is not finite (NaN passes
    every `<` comparison, so the guard has to come first). The comment in
    `applications/constants.test.ts` claiming "nothing produces this today" is
    corrected: the web contract types `statusUpdatedAt` as a plain `z.string()`, so a
    badly serialized date reaches the page without violating anything.
  - **14 · one control map.** `USER_ACTION_CONTROL` in `constants.ts` — a total
    `satisfies Record<UserAction, 'button' | 'menu'>` — plus a derived `ButtonStatus`
    type, `MENU_ACTIONS` derived from the map (so `RowActionMenu` no longer owns a
    literal list), and `VacancyTable`'s `BUTTON_VERBS satisfies Record<ButtonStatus,
    string>`. A status moved into the button half now leaves that map short a key; one
    moved out leaves an excess key. The two `onClick`s stay explicit — they open
    different dialogs, so a generic renderer would be machinery, not a saving.
  - **15 · `CLAUDE.md`** — 23 ADRs → 25.

  Suite **323 → 326**, 19 files. `lint` / `typecheck` clean.

### Landmine this step found in the dev stack

**A core change needs `docker compose restart api`.** The `api` container mounts the
repo at `/repo` and resolves `@job-search-copilot/core` through the workspace symlink
to the host's `dist/` — which the host build updates — but `nest start --watch`
watches `apps/api/src` only, so the running process keeps the **old core modules in
memory**. Everything looks right in the file tree and the live API serves stale code:
before the restart, `?search=%` returned all 460 rows; after it, 1 (the one posting
whose title contains a literal `%`). The web container is not affected — vite reloads
from the mount.

### Steps

- **Step 1 — the search term means what it says (5, 12, 10).** One helper in
  `packages/core/src/like.ts` — `escapeLikePattern()` escaping `\`, `%`, `_` —
  applied to **every** `contains` fed by user input: `list()`'s `search`, `company`,
  `title`, the `withCompanyMatchCounts` prefilter, and `application.service.ts`'s
  three. Escaping *fixes* finding 12 rather than hiding it: an escaped prefilter no
  longer over- or under-selects, so the comment becomes true instead of
  aspirational, and a company named `100% Remote` becomes searchable. Note `title`
  is **not** reachable over REST (deliberately, [ADR-0025](../decisions/0025-vacancies-list-search-server-side.md));
  MCP reaches it, and the prefilter path reaches it through a row's own value.

  The term is trimmed where the request is built and the query keyed on the trimmed
  value (so `" dev "` and `"dev"` share one cache entry and one refetch) — never on
  write, or a trailing space becomes untypeable. The tracker's client-side filter
  trims its own comparison.

  Tests: core cases for `%`, `_`, `\`; an api e2e case; a page case that a padded
  term reaches the server trimmed.

- **Step 2 — the log loads whole, in a stable order (9).** The web's
  `listApplications` becomes a serial offset loop, page size 500 (the DTO's own
  ceiling, so logs under 500 behave exactly as today). It stops on a **short page**
  (which also covers an empty one) and on `items.length >= total`; it re-reads
  `total` from each response, dedupes by id, and reports
  `Math.max(total, items.length)` so the tracker's footer keeps its `X ≤ Y`
  contract. The safety bound **throws** at 200 pages — a bound that quietly stopped
  would be the same lie this loop exists to fix.

  Two things this needs beyond the review:

  - **A tiebreaker in core.** `orderBy: { appliedAt: 'desc' }` alone leaves ties
    (the import path stamps a whole batch with one timestamp) and offset paging over
    tied rows can skip one entirely. `orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }]`,
    one line in `application.service.ts`, with the reason beside it — plus a core
    spec case with three identical stamps read across two pages.
  - **The MSW fake must page.** `buildApplicationHandlers` ignores `limit`/`offset`
    entirely; a fixture log past 500 would spin the loop into the throwing bound. It
    sorts and slices like the real endpoint, so the loop is exercised rather than
    assumed.

  `CompanyHistoryModal` gets the fixed join for free — same query key, no change.
  The dashboard is unaffected (`limit=1` count calls).

  Tests, new `apps/web/src/pages/applications/api.test.ts`: 1200 fixtures → one
  request per page with offsets `0/500/1000`; a short last page ends the loop; an
  empty page ends it even when `total` claims more; a row re-served by a shifted
  window is dropped; a server that never ends throws. Plus the core tie case.

- **Step 3 — the modal stops claiming what it can't back (8, 2).** The subtitle
  reads `data.total` and says so when the page is short ("showing 100 of 250"). The
  Action column's gate gains `applications.isError`, so a failed log renders `—`
  like a loading one instead of a false "Not applied" — and the ⏳ mark inherits the
  same gate. One short line in the dialog names the failure.

  Tests: a failing applications fake ⇒ no `Applied`/`Not applied` claim in the
  modal; `total` above the page ⇒ both numbers in the subtitle.

- **Step 4 — a failed apply stops reporting success (1).** `toast.success` moves
  into the apply mutation's `onSuccess`; `onConfirm` only hands the details up. The
  row error carries the server's message where the API sent one, instead of the
  generic `HTTP 500` the web's `api.ts` wraps it in.

  Tests: the Apply-dialog failure path — untested today, since the existing failure
  case covers only the `⋯` path — asserts no success toast, the row restored, the
  error visible.

- **Step 5 — `⋯` closes on a second click (6).** **Mechanism: make the trigger a
  declarative `popovertarget` invoker and delete its `onClick`.** The activation
  behaviour owns show/hide, so a click toggles; and because its default action runs
  *after* click listeners, keeping `onClick` would open then immediately close — the
  trigger would do nothing. Positioning (`top`/`right` from `getBoundingClientRect()`)
  moves into `onBeforeToggle`, which is the synchronous hook.

  Why not the obvious checks: `popover="auto"` light-dismisses on **pointerup**,
  before the click handler runs, so `matches(':popover-open')` reads false and a JS
  flag goes stale. The spec's endpoint rule is why the declarative invoker is
  different — light dismiss targets the invoker's own popover and stops there — but
  it is *not* an invoker exception, and `toggle` fires from a queued task, so a ref
  maintained from it is only right by timing luck.

  Today's component has **no** popover `id` at all, so the invoker needs one per row
  instance (finding 14's "only the clicked row's menu opens" depends on it).

  The jsdom stub must learn the invoker: `apps/web/src/test/setup.ts` is the whole
  Popover API there — jsdom 30.0.1 has **none** (`typeof el.showPopover === 'undefined'`;
  the comment at 58-61 claiming a partial implementation is wrong and is corrected
  with it) — so deleting `onClick` without teaching the stub would leave four
  existing menu tests with a menu that never opens. The stub gains a document-level
  click listener that toggles the target and fires `beforetoggle`; light dismiss,
  `:popover-open` and the top layer stay unmodelled on purpose — a stub that guessed
  the spec's ordering would make the tests lie.

  Tests: a second click closes the menu; the placement survives the move (assert the
  style after re-opening, which a stale-position bug would expose); only the clicked
  row's menu opens (per-instance ids).

  Browser pass — and **only** with real CDP input, because a page-JS `.click()` does
  not run light dismiss at all: open, second click closes (`:popover-open` false,
  computed `display: none`), third re-opens, an outside click still closes, the menu
  sits `trigger.bottom + 4` / `innerWidth - trigger.right`, Esc closes, scroll
  closes. If Chrome's default popover anchoring interferes with our coordinates,
  `position-area: none` in `.row-menu` is the one-declaration remedy.

- **Step 6 — the optimistic write survives a missing entry (3).** Patch every cached
  page, not one key: `queryClient.getQueriesData({ queryKey: VACANCIES_KEY })` for
  the snapshot, `setQueriesData` for the write, and a rollback that restores each key
  it touched — replacing the single-key `context.previous` that is `undefined`
  exactly in the window this bug lives in. One helper pair serves `actionMutation`
  and `applyMutation`; `savingIds`/`rowErrors` are already keyed by vacancy id, so
  they need no change.

  The load-bearing claim was checked rather than assumed: patching the *old* key is
  visible, because `keepPreviousData` re-reads that query's live cache entry whenever
  the result shape doesn't change. That belongs in a comment — a future reader will
  otherwise "optimise" the prefix write back to one key and silently restore the bug.
  The comment at `useVacancies.ts:35-38` is factually wrong (`cancelQueries` /
  `invalidateQueries` *do* prefix-match) and is what produced the single-key write;
  fix it here.

  `useApplications.ts` is **not** broken — one key, always present — and is left
  alone.

  Tests: a term typed with its request held open by a gate the test owns, a row
  clicked, the tag asserted to move while the term's own key stays empty (so no
  refetch can explain it) — plus the same with a failing PATCH, proving every cached
  page comes back. There is no deferred/gate helper in the web tests today (the two
  in-flight cases use MSW's `delay()`), so this step adds the first one.

- **Step 7 — one place decides whether a vacancy was analysed (11).** A derived
  `hasAnalysis` on `EstimatedVacancyListItem`, computed in `core` from the sentinel
  the placeholder path writes (`estimationComment: 'N/A'`), documented where it is
  derived with its ceiling named. The modal's score cell and `/vacancies`' both read
  it, so one row can no longer be `—` in one place and `0%` in the other;
  `isSafeExternalUrl` goes back to meaning only "is this a link". The dashboard's
  postings-scored tile stops claiming analysis it cannot count — relabelled, with
  the `hasAnalysis` list filter noted as the deferrable upgrade.

  > Landmine: a *derived* list-item field must be `.optional()` in the web schema,
  > because that schema also parses the `PATCH .../user-action` response, which
  > carries no derived fields ([ADR-0025](../decisions/0025-vacancies-list-search-server-side.md),
  > [`../contracts.md`](../contracts.md)). `companyMatchCount` is the precedent.

  Tests: core spec for the derivation on a placeholder and a real row; the modal's
  importer case, whose fixture currently hands a `tracker://` row a real comment and
  so passes for the wrong reason; a `/vacancies` case asserting a placeholder
  renders `—`.

- **Step 8 — the small corrections (4, 13, 14, 15).** Four independent fixes in one
  session: `q` coerces rather than rejects a JSON-parsed number, and `/tracker`'s
  `status` tolerates junk instead of replacing the page with "Something went wrong!";
  `timeAgo` fails open like `daysSinceLastMove` (and the test comment claiming
  nothing produces a bad stamp is corrected); the button-vs-menu split becomes one
  `satisfies Record<UserAction, 'button' | 'menu'>` in `constants.ts` that both
  components read; `CLAUDE.md`'s ADR count goes to 25.

## Deferred

| Item | Why |
| --- | --- |
| **Arrow keys and the `role="menu"` contract** (finding 7) | The click-to-close fix is what breaks the UI today; a roving-tabindex menu is a keyboard-navigation design of its own, and the roles already announce a contract nothing depends on yet. |
| **A real "availability" column** (finding 11's tail) | `hasAnalysis` is a projection over a sentinel; an explicit column would be honest but needs the analyzer and the importer to write it, which is Phase 4 work. |
| **A `hasAnalysis` list filter** | The dashboard's relabel needs it to make the tile truthful instead of merely unclaimed. Server-side filter + DTO + web UI — a surface, not a correction. |
| **Flipping the tip bubble below the control for the top-most visible row** | Measured in phase 2.1, step 9: a bubble on the first visible row of a scrolled list is clipped by the scroll box. The fix needs `useVirtualRows` to expose the row's offset; it is a visual nicety, not a false claim. |
| **`scrollIntoView` for the marked row in the history modal** | Phase 2.1, step 8. The cap can hide the row the modal was opened from. |
| **The Comment column prints the sentinel text for placeholders** | Found in step 7 and left alone: `/vacancies` renders `ExpandableText text={item.estimationComment}`, so the 203 imported rows show a literal "N/A" in that column. Truthful, unpolished — and hiding it is one `hasAnalysis ? … : '—'` once someone decides what a placeholder's comment column should say. |

## Landmines

- **`packages/core` is consumed as `dist/`.** After any core edit run
  `npm run build -w @job-search-copilot/core` before the api / mcp tests; root
  `npm test` does not build core (`npm run typecheck` does), so a stale `dist` makes
  the tests pass against the previous service. **Read the build's exit code, not its
  output files** — `tsc` emits JS even when it fails (phase 2.1, step 3).
- **`index.css` never loads in jsdom** (`css` unset in `apps/web/vitest.config.mts`
  ⇒ Vitest's default `false`), so no test can see a CSS regression. Everything
  visual is browser-only evidence.
- **The web vitest config sets no `css` key at all** — phase 2.1's landmine text
  says `css: false`; that is the effective default, not a line in the file.
- **An escaped `contains` cannot use the trigram index** the `company`/`title`
  columns carry (`pg_trgm` + GIN): Prisma binds the value as a parameter, so
  escaping adds backslashes the index cannot serve — a leading-`%` scan either way,
  fine at ~300 rows, and the scale boundary is already named in
  [ADR-0025](../decisions/0025-vacancies-list-search-server-side.md).
- **`total` keeps its meaning** ("rows matching the filter"), including under the
  new paging loop: the dashboard reads four counts off it by asking for `limit=1`,
  and making it the page size would misreport every dashboard number silently
  ([ADR-0024](../decisions/0024-web-shell-and-theme.md)).
- **`popover="auto"` light-dismisses on pointerup**, before a click handler runs —
  so any JS flag set from a click listener is already stale. This is why step 5 uses
  the declarative invoker rather than reading `:popover-open` in `onClick`.
- **`localStorage`-free, but not state-free**: the tracker's footer contract
  (`Showing X of Y`) is asserted by tests that read the same numbers the paging loop
  now computes — `Math.max(total, items.length)` exists to keep `X ≤ Y`.

## Verification

Per step: `npm test` green **in the same session** (the checkbox is ticked only
after that), plus `npm run lint` and `npm run typecheck`; core steps rebuild `dist`
first.

End-to-end with `npm run dev:api` and `npm run dev -w @job-search-copilot/web`:
search `%` and a padded term; open a duplicate company's modal with the API stopped
(the Action column must read `—`, not "Not applied"); click `⋯` twice; trigger a
failing apply and watch for the absence of the green toast; open a company with 150+
vacancies and read both numbers.

Browser-only claims — a popover's real state under real input, a hovered bubble, a
rendered dialog — go through the throwaway CDP driver in `%TEMP%/jsc-browser/`, the
convention from phase 2.1 that caught the open-menu bug jsdom could not see.

Commits only on explicit instruction.
