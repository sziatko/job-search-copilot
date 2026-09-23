# Phase 2.1 — the vacancies table: search, company history, row actions

Not a phase of its own. Three follow-up changes to surfaces Phase 1 built and
Phase 2 reworked, planned before implementing because
[`../README.md`](../README.md) requires it — the web app's tables are the place a
change goes wrong silently, not loudly.

## Goal

`/vacancies` is the triage screen: the place a row is decided. Today it can only
be filtered by status, the "have I dealt with this company before" answer lives
outside the app, and acting on a row means a native `<select>`. Phase 2.1 closes
those three gaps.

## Scope

1. **Search by vacancy title or company** on `/vacancies`, mirroring `/tracker`'s
   input — but server-side ([ADR-0025](../decisions/0025-vacancies-list-search-server-side.md)).
   The status filter stays client-side.
2. **A duplicate-company button** next to the company name of each row: shown only
   when the company has ≥2 vacancies, labelled with the number of *other* matches,
   and opening a modal that lists every vacancy of that company — date, vacancy,
   score, applied / not applied. The modal's data is fetched when it opens, not
   with the list.
3. **The Actions column becomes buttons**: a new Status column carries the current
   `userAction` as a tag, and the former Copy column becomes Action holding
   `Copy · Apply · Decline · ⋯` — the last a native popover revealing the two
   remaining statuses. Apply and Decline keep the dialogs they already open.

4. **What the browser pass turned up** (steps 5–8, below). Planned after the fact,
   because only a browser can see them:
   - every row's ⋯ menu rendered *open* — a CSS cascade-origin bug, not a typo;
   - the Action column's four text buttons become **icons with hover bubbles**, in the
     same style as the Copy button's "Copied" flag, the duplicates button's native
     `title` included. Bubble texts stay short — `Copy` (⇄ `Copied`), `Apply`,
     `Decline`, `More` — and the duplicates button keeps its sentence
     ("7 other vacancies at contoso"). Action column 250 → **180px**;
   - `/vacancies` stops repeating its title: the card head goes, `.toolbar` takes its
     `pt-[16px]`, and the count moves into the `.table-foot` as
     `Showing N of M vacancies · scores from the vacancy-evaluator skill`, the way
     `/tracker` does it;
   - the company-history modal marks **the row it was opened from** (accent-tinted row
     plus a `Current` pill) and caps its height (`max-h-[60vh]`, scrolling) — today it
     can grow past the viewport with `body { overflow: hidden }` behind it.

5. **Three follow-ups from reading the finished screen** (step 9), asked for directly
   rather than planned: the history modal a size wider, the Action column's hover
   bubbles above their buttons instead of below them, and the duplicates button's
   native `title` replaced by that same bubble.
6. **The last native tooltips** (step 10): the ⏳ stale mark in both tables and the
   theme toggle, moved onto the same bubble — no `title` tooltip is left in the page
   content, and the two in the sidebar are the deliberate exception (step 10 says
   why).

Out of scope: `/tracker`'s status `<select>` (unchanged), the tracker's
`updated on` date (already there), server-side pagination, a server-side status
filter, and MCP parity for `search` (MCP already has separate `company` / `title`
filters).

## New surfaces

- `GET /api/v1/estimated-vacancies?search=` — `company` OR `title`, ILIKE
  `%term%`, case-insensitive; ANDs with the other filters.
- `companyMatchCount` on every `EstimatedVacancyListItem` — a derived, non-column
  number: how many vacancies have a `company` that contains this row's company
  (case-insensitive substring, i.e. the semantics of the existing `company`
  filter). Detail in [`../contracts.md`](../contracts.md).

## Decisions introduced this phase

[0025](../decisions/0025-vacancies-list-search-server-side.md)

## Status

Step 0 (this doc, [ADR-0025](../decisions/0025-vacancies-list-search-server-side.md),
and the `contracts.md` rows it promised) and steps 1–10 all landed 2026-09-23. The
phase is code-complete; steps 5–8 are what the browser pass turned up and steps 9–10
were asked for after reading the finished screen, so those six are the steps whose
evidence is a real viewport rather than jsdom.

Landed as one commit, `3e7e86d`, rather than one per step: the tree that passed the
suite is the tree that was committed, and splitting it after the fact would have
shipped intermediate states nothing had run.

The **browser pass** ran 2026-09-23 against the dev stack, driving real headless
Chrome over the DevTools protocol (a throwaway script outside the repo; Node's own
`WebSocket`, no dependency). It answered the two questions no test can — the ⋯ menu's
coordinates inside a real viewport, and `min-w-[1200px]` with the new column widths —
and turned up one bug and three divergences, now planned as **steps 5–8** below. The
bug is worth the paragraph: every row rendered its ⋯ menu *open*, permanently, on top
of the Status tag. The cause is a cascade-origin trap, not a typo, and step 5 records
it. So the jsdom suite was green throughout, and could never have been otherwise.

- [x] **1 · the `search` param on the vacancies list (backend).** 2026-09-23.
  Landed as planned, no divergence. Core rebuilt before the api e2e run.

  `search?: string` on `ListEstimatedVacanciesFilters`
  (`packages/core/src/estimated-vacancy.types.ts`) → **one** `OR: [company, title]`
  clause inside `list()`'s `where` (`packages/core/src/estimated-vacancy.service.ts`
  — the `where` is a flat spread, so this is one entry, not two), mirroring
  `application.service.ts:109-116`. Exposed as `search?` (`@IsOptional()
  @IsString()`) on `ListEstimatedVacanciesQueryDto`
  (`apps/api/src/estimated-vacancies/dto/list-estimated-vacancies.dto.ts`).
  Tests: list cases in `packages/core/src/estimated-vacancy.service.spec.ts`
  (matches company, matches title, case-insensitive, ANDs with other filters,
  `total` is the match count under `limit`/`offset`) and `?search=` cases in
  `apps/api/test/estimated-vacancies.e2e.spec.ts`. `contracts.md` is already
  updated by this doc's step 0 — don't re-add.
- [x] **2 · the search UI on `/vacancies`.** 2026-09-23. Landed with two
  divergences, both recorded here:

  1. **No `placeholder` prop on `SearchInput`.** The move happened (renamed
     `ApplicationSearchInput` → `SearchInput`, still `'Search company or role…'`
     hardcoded), but the prop was dropped: neither caller wants different text —
     "role" already covers a vacancy title — and a prop with no caller is dead
     flexibility. Add it when a page needs its own wording.
  2. **`placeholderData: keepPreviousData` on the list query**, which the plan did
     not mention. A new term is a new key with no cache entry, so without it the
     table blanks to "Loading…" on every debounced keystroke — invisible in a test,
     obvious in a browser.

  What the next steps need that the code does not say:

  - The test file kept its `useVacancies.test.ts` name (mirroring the tracker's
    page-level-but-hook-named `useApplications.test.ts`) and now holds
    `renderVacancies(path)` + `rowCompanies()` + `rowSelect(company)` — steps 3
    and 4 reuse all three.
  - The APPLIED fake in that file must flip `items[0].userAction` like the real
    POST does, **and** its response needs `statusComment: null`. The old fake had
    neither honest half and passed only because it mutated `items` — the
    malformed response failed to parse and the refetch hid the rollback.
  - `search` is unvalidated in a browser: the term reaching `apps/api` past the
    first 100 rows is only covered by step 1's e2e, not end-to-end.

  As built: `ApplicationSearchInput.tsx` moved to
  `components/ui/SearchInput.tsx` (`git mv`, so it is a rename in the diff) and its
  export renamed `SearchInput`; `ApplicationsPage.tsx` imports it from `@/components/ui`.
  `router.tsx` gives `/vacancies` its own `vacanciesSearchSchema` and
  `validateSearch`, the same arrow-parse shape as `/tracker`'s.
  `useVacancies.ts` reads and writes `q` through `useSearch({ from: '/vacancies' })`
  / `useNavigate({ from: '/vacancies' })`, sends it as `search`, and keys the query
  `[...VACANCIES_KEY, q]` — **eight** exact-key call sites, not the six this doc
  predicted: the `useQuery` key, `patchCachedItem`'s `setQueryData`, two
  `cancelQueries`, two `getQueryData`, two `setQueryData` on error. The two
  `invalidateQueries({ queryKey: VACANCIES_KEY })` calls stay prefix-shaped, as
  planned. `VacanciesPage.tsx` gained a `.toolbar` row holding the search input and
  the status filter, the latter moved out of `.card-head` (deviates from the mockup,
  deliberately, as on `/tracker`). `api.ts` takes `search?` and sets it only when
  non-empty. MSW's `estimated-vacancies` GET filters on `search`; the `applications`
  handler is untouched. Tests: `useVacancies.test.ts` rewritten page-level (all 10
  green, including the 8 ported behaviour tests), new cases for "the term reaches the
  server" — which only passes because the MSW fake filters on the param — and "the
  initial term comes from the URL".
- [x] **3 · the company button and its modal.** 2026-09-23. Landed as planned,
  with three things the plan did not have:

  1. **`listEstimatedVacanciesPage` had no `company` param at all** — step 2 only
     added `search`. Added alongside it in `pages/vacancies/api.ts`. The tests are
     what found it: without it the modal silently fetches the whole table, and the
     MSW fake (which filters honestly) says so.
  2. **The Action column reads `—` until the `['applications']` query resolves.**
     "Not applied" is a claim, and for one round-trip it would be a false one. The
     two tests that assert `Applied` / `Not applied` therefore `waitFor` instead of
     asserting on the first paint.
  3. **`.meta-btn` in `index.css`** — `.icon-btn` is a 30px square and would stretch
     the row's 12px meta line as the count appears.

  As built: `companyMatchCount: number` on `EstimatedVacancyListItem`, added by a
  private `withCompanyMatchCounts` that `list()` awaits — one prefilter query over
  the page's distinct companies, the exact count in JS, `names.length === 0` guarded,
  ceiling named in a `ponytail:` comment. Web: optional
  `companyMatchCount: z.number().optional()` in `types.ts` (why optional is at the
  field), the `IconHistory` + `.meta-btn` button in `VacancyTable.tsx`'s `.role-meta`
  when `others >= 1`, `CompanyHistoryModal.tsx` fetching `['vacancy-company', company]`
  + the shared `['applications']`, `VacanciesPage.tsx` holding `historyCompany`.
  MSW now honours `company` **and derives `companyMatchCount`** the way the real
  endpoint does, so the button is exercised against real semantics rather than a
  hand-set number. Tests: 5 new core spec cases + 5 page-level ones (button
  visibility and wording, the modal's join, the ⏳, the importer `—`, and "fetched on
  open, not with the list" via MSW's `request:start` events).

  **A landmine this step walked into.** `npm test` was green while
  `npm run build -w @job-search-copilot/core` was **failing**: `EstimatedVacancyListItem`
  was used in the service without being imported, and esbuild strips types so vitest
  never noticed. `tsc` still emits JS when it fails, which is why `dist` looked
  updated. Read the build's exit code, not its output files — and run
  `npm run typecheck`, which is the only thing here that typechecks core at all.
- [x] **4 · the Status and Action columns.** 2026-09-23. Landed as planned. The
  columns as built: Added(90) · Vacancy · Score(90) · Rec.(120) · Comment ·
  **Status(150)** · **Action(250)**, `COL_COUNT` still 7, `min-w-[1200px]`.
  `USER_ACTION_TAGS` (variants neutral/accent/good/bad), `IconMore`,
  `RowActionMenu.tsx` (native `popover="auto"`), `UserActionSelect.tsx` deleted,
  `requestActionChange` untouched, all four row controls `disabled:opacity-50`.

  What the plan did not name:

  - **`CopyVacancyButton` needed a `disabled` prop** — it had none, so "all four
    controls disable" meant editing a component the step was not about.
  - **`.btn-danger:hover` needed a colour to hover to.** There was no `-ink` token
    for `bad`, so one was added in both themes (`--color-bad-ink`: `#b32b2b` light,
    `#eb9a9a` dark) rather than hovering to `bad-soft`, which would have inverted
    the button instead of shading it.
  - **`disable`d styling is `disabled:opacity-50`, and the Copy button is an
    `.icon-btn`** — the old `select.status-select:disabled` rule is now dead CSS.
  - **The disabled-state test asserts all four controls inside one `waitFor`.**
    They all derive from the same `saving` flag, so they have to agree on a single
    render; checked one at a time, the first can pass while the request settles and
    the second already reads enabled.

  Tests: the six select-driven cases became button-driven ones — the tag, both
  dialogs, both ⋯ items, the in-flight disabled state, and the failed-save
  rollback. The `rowSelect` helper died with `UserActionSelect`; `rowOf(company)`
  returns the row's query scope, and `menuItem(name)` its popover item.

- [x] **5 · the closed-popover guard.** 2026-09-23. The `[popover]:not(:popover-open)`
  rule in `index.css` plus the two comment corrections; why it sits where it sits is in
  `## Landmines`, and it is the one thing here no test can hold.

  Evidence, headless Chrome, before → after: every closed menu `display: "flex"`,
  125×78, sitting over the Status tag → `display: "none"`, 0×0, zero `:popover-open` on
  load; a click on a ⋯ trigger still opens exactly one — `flex`, `position: fixed`, box
  `[1238,396,125,78]`, inside the viewport, clear of the tag.

  Two things the next step should not rediscover: a probe's keys are evaluated when its
  result object literal is built, so read pre-click state into a local or the "before"
  number comes back post-click; and the full `npm test` reported a forks-worker startup
  timeout for `useVacancies.test.ts` while still printing green — re-running that file
  alone is what settled it.
- [x] **6 · the Action column as icons with `.tip` bubbles.** 2026-09-23. Landed as
  planned, with three things the plan did not have:

  1. **`.copied-flag` is gone; `.tip` replaced it.** A hover bubble and a "Copied"
     flash are the same box with the same reveal, so one class does both
     (`.icon-btn:hover`, `:focus-visible`, `.icon-btn.flash` all show it) — and that
     made `CopyApplicationButton` on `/tracker` a caller too: it now says `Copy`
     until it is clicked, where the flag said nothing until then. The alternative was
     two near-identical rules. ~~`.table-body-scroll .tip` carries the same flip below
     the button the old flag needed.~~ **Undone in step 9** — that flip is deleted, so
     the bubble is above the button everywhere; what it cost is measured there.
  2. **`.icon-btn-danger` keeps the red.** As a text button Decline wore `.btn-danger`
     and hovered to `--color-bad-ink`; on plain `.icon-btn` its hover would be accent
     blue — the same as Apply, on the one control in the row that is not harmless.
     One rule restores `bad-soft`/`bad-soft-border`/`bad-ink` on hover.
  3. **Apply and Decline carry no `aria-label`.** Their bubble text is their visible
     label and their accessible name comes from it; adding a label would have
     duplicated it. Copy and ⋯ keep theirs (`Copy <title> at <company>`, `More
     statuses`) because their bubbles are shorter than what they do.

  The column is **180px**: four 30px buttons + 3×6px gap = 138px of the 144px a cell
  has inside its 36px of padding, so the row stays on one line with 6px to spare —
  measured, not computed, in the pass below. `IconCheck` / `IconCross` are new in
  `components/icons.tsx`.

  Tests: three in a `the action column` describe — the four bubble texts, the width,
  and the `Copy ⇄ Copied` swap. The swap test has to assert the idle `Copy` too: the
  old flag was *always* `Copied` and only changed opacity, so "shows Copied after a
  click" passed before this step changed a line. Both bubble assertions are scoped by
  `selector: '.tip'` — the Rec. column's tag also reads `Apply`.

  Evidence, headless Chrome, 1440×900, 19 rows: Action resolves to 180px and four
  buttons sit on one line, 138px used of the 144px inside the cell's padding; every
  closed tip is `opacity: 0` and a real pointer move (the driver's hover arg) leaves
  exactly one at `opacity: 1`, box `[1264,314,43,22]` — 5px under the button, inside
  the scroll box's clip, clear of the row below. The hovered button itself: Apply
  accent-soft/accent-ink, Decline `bad-soft`/`bad-ink` (its red survived). The ⋯
  trigger, whose class changed, still opens exactly one menu — 125×78, in the
  viewport, no overlap on the Status tag.
- [x] **7 · `/vacancies`: one title, count in the footer.** 2026-09-23. Landed as
  planned, plus one gate the plan did not name:

  1. **The foot renders only when `!loadError && !loading`**, like the tracker's.
     Ungated it reads "Showing 0 of 0 vacancies" for the whole first load, which is a
     claim about data that has not arrived; `keepPreviousData` hides it on later
     keystrokes, so the first paint is the only place it would show.
  2. **"Scroll for more" is gone.** The plan gave the foot's new text verbatim and did
     not carry it over. `docs/design/dashboard-reference_2.html` still shows the old
     wording — the plan supersedes it, don't "restore" it from the mockup.

  As built: the `card-head` block is out of `VacanciesPage.tsx` (its `<h2>` repeated
  the shell's `<h1>`; `.card-head` is not dead, the dashboard still uses it),
  `toolbar` became `toolbar pt-[16px]` — the toolbar's own rule only sets `pb`, so
  without it the search box hugs the card's border. The count's two numbers stay what
  they were: `visibleItems.length` is post-status-filter, `total` is the server's
  match count for the term.

  Test: one case in `useVacancies.test.ts` — no level-2 heading named "Analyzed
  vacancies" (the shell's is the `<h1>`), and the foot reads `Showing 2 of 3
  vacancies · …` from three fixtures the status filter cuts to two, so the test fails
  if the two numbers ever collapse into one. `npm test` 18 files / 297 tests green in
  this session; `npm run lint` and `npm run typecheck` clean.

  Evidence, headless Chrome, 1440×900, `probe-step7.mjs`: `h1,h2,h3` is a single
  `H1` "Analyzed vacancies"; `.card-head` count 0; the card's first child is the
  toolbar at `padding-top: 16px`, 1px inside the card's top edge (its border); the
  foot is the card's last child, 1px off its bottom edge, `textContent` `Showing 95
  of 444 vacancies · scores from the vacancy-evaluator skill` against the endpoint's
  `total: 444` with 95 of the 100 it loads NOT_REVIEWED.
- [x] **8 · the history modal: the current row, and a bounded height.** 2026-09-23.
  Landed as planned, with two things the plan did not have:

  1. **`.row-current` in `index.css`, not a `bg-accent-soft` class on the `<tr>`.**
     The global `tbody tr:hover` (one class + two elements of specificity) paints
     over the tint on exactly the row the cursor is sitting on — the row just
     clicked. The rule carries its own `:hover` so the marker survives it. Same
     blind spot as step 5's: `index.css` never loads in jsdom, so no test can see
     this either.
  2. **The tint is half-strength** (`bg-accent-soft/50`). The `Current` pill wears
     the full tint, so on a full-tint row it would have been a bare border.

  As built: `currentId: number` on `CompanyHistoryModal`, `onShowCompanyHistory` →
  `(company, vacancyId)` in `VacancyTable.tsx`, and `VacanciesPage`'s
  `historyCompany: string` became `companyHistory: { company, vacancyId } | null`.
  The modal wraps its table in `max-h-[60vh] overflow-y-auto`; the `<thead>` is
  already `sticky` from the global rule, so it holds while the modal scrolls.

  Tests: two more in `useVacancies.test.ts`'s modal describe — "marks the row it was
  opened from" clicks the *second* Acme row, which a modal marking its own first row
  would fail; the height case asserts the box that does the capping, since jsdom has
  no layout to cap. `npm test` 18 files / 299 tests green in this session; `npm run
  lint` and `npm run typecheck` clean.

  Evidence, headless Chrome, 1440×900, `probe-step8*.mjs`: `contoso`'s 8-row modal
  draws a 576×693 dialog whose bottom is 796 inside the 900px viewport, and a scroll
  box at `max-height: 540px` (= 60vh) with `scrollHeight` 634 — the cap binds and the
  list scrolls. Clicking each of `contoso Polska`'s four page rows in turn marked
  `#560` / `#564` / `#559` / `#565` at list indices 2 / 1 / 3 / 0: the marker follows
  the clicked row rather than the first one, exactly one `.tag.accent` exists in the
  dialog, and it sits inline with the title (pill top 220 against the title's bottom
  240) beside `contoso #593`. With a real pointer parked on the marked row Chrome
  confirms `:hover` and the tint is unchanged — `oklab(…)/0.5`, not
  `--color-surface-alt` — with the pill still distinguishable from the row it is on.

  **Left unmeasured, and the one thing here worth a follow-up:** a company whose
  modal is longer than the cap can open with the marked row below the fold of the
  scroll box (contoso's own modal needs 634px for 540px of box). Nothing scrolls it
  into view — not asked for, and it would have to not fight the newest-first order.
  Folding it in is `scrollIntoView` on the marked row, when someone wants it.
- [x] **9 · a wider modal, bubbles above, and the duplicates button's bubble.**
  2026-09-23, asked for straight after step 8 was reported, so no plan step preceded
  it and the tests came with it.

  As built: `maxWidthClassName="max-w-2xl"` on the modal — the scale step above
  `max-w-xl`, 576 → 672px, since "about 50px" was answered with the next round
  number on the scale; `.table-body-scroll .tip`'s flip **deleted**, so every bubble
  sits above its control as `.tip` always did; and the duplicates button's `title`
  became `<span className="tip">{othersLabel}</span>`, with the count in an
  `aria-hidden` span — without it the button's accessible name reads "1 1 other
  vacancy at Acme". `.meta-btn` gained `relative` (its tip's containing block) and
  joined `.tip`'s reveal selectors.

  Tests: the duplicates describe now checks the bubble's text, that `title` is gone,
  and the exact accessible name. Nothing else — all three changes are CSS, and
  `index.css` never loads in jsdom.

  Evidence, headless Chrome. Width: the dialog is 672×693 (was 576×693) with its
  scroll box 534 → 630px, which is what stops "Front-End Developer for Digital
  Application" wrapping; still inside the 900px viewport, still capped at 540px and
  still scrolling, marker and pill unchanged. Bubbles: a pointer on row 3's Decline
  leaves its bubble at `[1295,462,52,22]` above a `[1306,489,30,30]` button — 5px of
  gap, `above: true` — and on row 0's too (`clippedAboveScroller: 0`, the sticky
  `<thead>`'s 34px being the room the old flip was protecting). A pointer on the
  duplicates button shows "1 other vacancy at Strategic Staffing Solutions" above it,
  `title` absent, opacity 0 → 1.

  **What "above" costs, measured rather than assumed:** with the list scrolled to
  `scrollTop: 400`, the first visible row's bubble computes to `tipTop: 148` against a
  scrollport top of `177` — 29px of clip, i.e. the whole bubble, so hovering the
  top-most visible row's icons shows nothing. Rows below it are fine. The old flip
  existed for this; the per-row answer (flip only when the row's offset from the
  scroll offset is under ~40px, which `useVirtualRows` could expose) was not built.
  The scroll box is the workaround: nudge the list and the bubble appears.
- [x] **10 · one bubble everywhere.** 2026-09-23, asked for straight after step 9: the
  ⏳ marks and anything else still showing the browser's own tooltip.

  The conversion is one line per site — `title` out, a `<span className="tip">` child
  in — so the step is really the three things it needed:

  1. **The reveal selector stopped naming its hosts.** `.icon-btn:hover .tip` and
     `.meta-btn:hover .tip` became `:hover > .tip` (with `:focus-visible` / `.flash`):
     whichever element *directly contains* a bubble reveals it. A list is what every
     next tip has to be appended to, and the ⏳ — a bare `<span>` — would have been
     the third name in it.
  2. **`.timeout-mark` gained `relative`**, the same containing-block requirement
     `.meta-btn` has.
  3. **Two placements a centred bubble cannot use**, both measured before choosing:
     the ⏳ leads the first column and lost ~50px of its left half to the scroll box's
     edge — clipped, not merely overhanging — so `.date-cell .tip` hangs from the
     marker's left edge; and the theme toggle trails the topbar and overran the
     window by 19px, so `.topbar .tip` hangs from its right. `translate-x-0` is what
     cancels the base `-translate-x-1/2`; that it does is measured, not assumed
     (`translate: 0px` computed, `transform: none`).

  Sites converted: `ApplicationsTable`'s ⏳, `CompanyHistoryModal`'s ⏳, `ThemeToggle`
  (which was already an `.icon-btn`, so only the swap was needed).

  **Left native, deliberately:** the sidebar's six — the rail toggle and the five nav
  items. `.sidebar` is `overflow-x: hidden`, so a bubble inside it is clipped at the
  sidebar's own edge: centred on a 16px nav icon, "Application tracker" (~110px) loses
  its left half even with the rail expanded, and in the collapsed rail — where the
  tooltip is the *only* label the item has — nearly all of it would be. Doing those
  honestly means restructuring the sidebar's overflow first, which is not a tooltip
  change; they keep the browser's own tooltips until then.

  Tests: the vacancies ⏳ case now asserts the bubble's text and that `title` is gone,
  and the tracker's stale-row case grew the same assertion. Nothing else — reveal and
  placement are CSS, and `index.css` never loads in jsdom.

  Evidence, headless Chrome 1440×900. The modal's ⏳ (`probe-tips-stale.mjs`), hovered:
  `opacity: 1`, computed `left: 0px` / `translate: 0px`, bubble `[423,457,141,22]`
  above a `[423,484,13,17]` mark, `overhangsCellLeft: 0`, `overhangsDialogLeft: 0`.
  The tracker's (`probe-tips-tracker.mjs`, scrolled to the row first — a hover needs
  the element inside the viewport): the same shape at `[119,601,141,22]` above
  `[119,629,13,17]`, `clippedLeft: 0`, `clippedAbove: 0`. The theme toggle: bubble
  `[1288,11,123,22]`, right edge 1411 inside the 1440 window,
  `overhangsWindowRight: 0` — centring had measured 19px over.

## Landmines

- **`packages/core` is consumed as `dist/`.** After any core edit run
  `npm run build -w @job-search-copilot/core` before the api / mcp tests; root
  `npm test` does not build core (`npm run typecheck` does), so a stale `dist`
  makes the tests pass against the previous service.
- ~~**jsdom 30 has no Popover API** … stub by setting **inline** `display`.~~
  **Corrected in step 4 — the guess was wrong.** jsdom 30 *does* define
  `showPopover`; what it lacks is `:popover-open` in its selector engine, so
  `[popover]:not(:popover-open){display:none}` matches whether or not the popover is
  open and keeps the element hidden for good. What actually works, in
  `apps/web/src/test/setup.ts`: override both methods to toggle a `.popover-open`
  class, unconditionally, and inject
  `[popover]{display:none !important}[popover].popover-open{display:block !important}`
  as the rule that class means. Verified by a throwaway test that printed
  `getComputedStyle`: `none` closed, `block` open.

  **Step 4's reading of the spec was wrong, and step 5 is what paid for it.** It
  claimed the UA rule is `display: none !important`. It is not: the HTML spec marks
  only `:popover-open::backdrop`'s `pointer-events` as `!important`, and the rule
  hiding a closed popover is an ordinary UA declaration. `!important` in the stub is
  a jsdom-local necessity (it has to beat jsdom's own sheet), not a fact about the
  browser — so it hid the very bug the pass found.
- **An author `display` on a popover defeats the UA's hidden state** — that is what
  left every row's ⋯ menu on screen (`.row-menu`'s `@apply flex`). The guard that
  restores it, `[popover]:not(:popover-open) { display: none }` in `index.css`, lives
  in **`@layer components`**, and moving it to `@layer base` re-breaks the app: layers
  are compared *before* specificity, so a base-layer rule loses to `components`.
  Nothing in CI can see this — `index.css` never loads in jsdom (`css: false` in
  `apps/web/vitest.config.mts`), so the regression is browser-only.
- **The top layer beats `z-index`**: an open popover paints above the `z-50`
  modal, so the menu must close *before* a dialog opens.
- **`[popover]`'s UA style sets `inset: 0; margin: auto`** and Preflight does not
  neutralise it — set `inset: auto` explicitly alongside the `position: fixed`
  coordinates taken from `getBoundingClientRect()` (absolute positioning is
  clipped by `.table-body-scroll`, the same clipping that forced the
  `.copied-flag` override in `index.css`). Close the menu on `scroll` in the
  capture phase: a fixed menu detaches from its row, and the virtualizer unmounts
  rows.
- **`.table-body-scroll` is `max-height: 560px`**, not the `max-h-[70vh]` that
  `phase-2.md` claims — that line is stale.
- **`.sidebar` is `overflow-x: hidden`**, so it clips anything inside it that reaches
  past its edge — a `.tip` bubble included, which is why the six tooltips in there are
  still the browser's own (step 10). Fix the overflow before adding anything that
  wants to overhang.
- **A global `tbody tr` rule outranks a single utility class.** `tbody tr:hover`
  (0,1,2) beats `.bg-accent-soft` (0,1,0), so anything that tints a row needs its own
  rule beside it in `index.css` — `.row-current`, and the `:hover` half with it.
  Same blind spot as the popover guard: `css: false` in the web vitest config.
- **`total` keeps its meaning** ("rows matching the filter"), but the page still
  loads at most 100 rows and the modal's applications at most 500: the footer
  count is truthful while the list is truncated.

## Verification

Per step: `npm test` green **in the same session** (the checkbox is ticked only
after that), plus `npm run lint` and `npm run typecheck`. Steps 1 and 3 also need
the core build above. End-to-end, with `npm run dev:api` and
`npm run dev -w @job-search-copilot/web`: search by company and by title
(including a vacancy past the first 100), the duplicates button and its modal
(⏳ and `—` included), all four actions from the new cell, and a hover on Decline.

The **browser pass** is not a by-hand checklist any more. `%TEMP%/jsc-browser/`
(nothing in the repo, no dependency) holds a small DevTools-protocol driver:
`node cdp.mjs <url> <probe.js> [out.png] [settleMs] [hoverSelector]` launches
headless Chrome, navigates, runs the probe expression in the page and writes a
screenshot — and with a `hoverSelector` it drives a real pointer over that element
and re-runs the same probe, printing it twice. `:hover` cannot be triggered from
page JS (synthetic events do not set it), so anything hover-only is only testable
through the browser's own input pipeline. That is how the step-5 bug was found, and
how steps 5–8 are each verified — what no jsdom test can see: computed `display` of
a closed popover, a menu's real coordinates, a hovered bubble, `min-w-[1200px]`
against real column widths, and whether a modal fits the viewport. Commits only on
explicit instruction.

Landmine in the driver rather than the app: its debug port must be random per run. A
fixed one collides with the previous run's Chrome, which is still shutting down, and
the next run dies with "chrome did not expose a page target". Same for a probe that
walks `document.styleSheets`: Tailwind's `@layer components` is a nested rule, so a
flat `[...cssRules]` filter finds none of these classes and reports an empty list
while the styles are plainly applied — check a `getComputedStyle` before believing it.
