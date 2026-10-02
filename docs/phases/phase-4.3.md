# Phase 4.3: fixes after phase 4.2 — skeletons, the company modal, two small fixes

## Goal

Fixes found while using phase 4.2. No migration. MCP and the skills do not change;
step 7 changes core and two REST list params.

- **Skeletons.** Every "Loading…" in the app becomes a skeleton in the shape of what
  loads: the four tables and the company modal draw their real header over skeleton
  rows, the dashboard and the vacancy page draw skeleton cards.
- **The company-history modal.** A CV column, Details opens in a new tab, and the row
  it was opened from scrolls into view.
- **The salary label** says "in the listing", but the value is what the user entered
  when applying.
- **The toaster** keeps the old theme after a click on the theme toggle until a
  reload.
- **A toast after every write** (added 2026-10-02): only Apply showed one.
- **"Needs your review"** ends far above the Pipeline funnel card on the dashboard.
- **"Other vacancies" counts disagree** for one company: #807 `contoso` lists 11
  others, #761 `contoso Polska` lists 4. The company filter and `companyMatchCount`
  are "rows whose company contains this name" (ADR-0025), which works one way only.

Decided with the user on 2026-10-02:

- **Skeletons everywhere**, not only in the modal.
- **Details opens in a new tab only from the modal.** The tables keep opening the page
  in place.
- **The field `salaryInListing` keeps its name.** Only the two labels change; renaming
  it (DB, REST, MCP, skills) is a separate question.
- **Toasts on status moves, application edits and comments** — not only Apply's.
- **The funnel card sets the dashboard row's height.** The review card loads 10 rows,
  fills that height and scrolls inside; on a phone (one column) all 10 show.
- **Same company = equal normalised name** (lowercase; parentheses, legal forms and
  trailing country words dropped) — [ADR-0032](../decisions/0032-same-company-normalised-name.md).
  Accepted miss: "Picnic" vs "Picnic Technologies". The substring `company` filter
  stays for MCP and the skills.

Out of scope, kept in the backlog: Recent activity with every status move (needs a
`source` on `StatusChange`), n8n intake, per-column filters.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`; the backlog rows it takes
  marked `planned (phase 4.3)`. — *2026-10-02.* Docs only; `npm test` 395/395 on the
  same code (main after the 4.2 merge).

- [x] **1 · Skeleton rows in the tables.** — *2026-10-02.* `npm test` 400/400. For step
  2's tests: `holdGet(path, when?)` in `test/msw/handlers.ts` holds a GET until
  `release()`. Step 3's sixth modal column also needs `SkeletonRows cols={5}` → 6 in
  `CompanyHistoryModal`, or `expectSkeletonTable` (`test/skeleton.ts`) fails. The
  shimmer has not been seen in a browser yet: no browser tool connected this session.
  - `components/ui/SkeletonRows.tsx`: `{ rows, cols }` → `rows` × `<tr>` of
    `<td><span className="skeleton" /></td>`. One `.skeleton` rule in `index.css`: a
    rounded bar on theme tokens (light and dark), a shimmer from `@keyframes`, none
    under `prefers-reduced-motion: reduce`.
  - While loading, the table stays and draws its real `<thead>`; its `<tbody>` holds
    the skeleton rows instead of the `Loading…` div that replaces the table today.
    `aria-busy` on the table, a `sr-only` "Loading…" so a screen reader still hears
    it. Where: `VacanciesPage` (`VacancyTable`), `ApplicationsPage`
    (`ApplicationsTable`), `LogPage`'s table, `CompanyHistoryModal` (its subtitle keeps
    its "Loading…"), `VacancyPage`'s `OtherVacancies` (returns `null` while pending
    today; the card's count keeps its "Loading…").
  - The virtualized tables (`useVirtualRows`) must not call `onEndReached` while they
    show skeleton rows.
  - **Tests.** Each place shows skeleton rows under the real header while pending and
    the data rows after; no test today asserts "Loading…".

- [x] **2 · Skeleton cards on the dashboard and the vacancy page.** — *2026-10-02.*
  `npm test` 402/402. Bar sizes are guessed, not measured: still no browser tool, so
  neither page's skeleton has been seen.
  - The same `.skeleton` bar, in the shape of the page: the dashboard's KPI tiles and
    its cards (`DashboardPage.tsx`'s `loading || !stats` branch); the vacancy page's
    real Back link, its header, and its status-history, description and details
    cards (`VacancyPage.tsx`'s `isPending` branch). `components/ui/SkeletonCard.tsx`
    (`{ lines }`: a heading bar over lines) is shared; the KPI tiles and the fact rows
    are drawn in place.
  - **Tests.** Each page shows its skeleton while pending, the content after
    (`expectSkeletonPage` / `expectLoadedPage` in `test/skeleton.ts`). The skeleton's
    tile and card count (dashboard) and fact-row count (vacancy) must match the loaded
    page's.

- [x] **3 · The company modal: CV, Details in a new tab, the current row in view.** —
  *2026-10-02.* `npm test` 405/405. `max-w-3xl` is an estimate (six columns' padding
  left the title ~110px at `2xl`); still no browser tool, so neither the width nor the
  scroll has been seen. jsdom's missing `scrollIntoView` is a no-op in
  `test/setup.ts`, so `vi.spyOn` works on it.
  - **CV column.** `✓` / `—` from `applicationsByVacancy`'s `usedTailoredResume`, the
    same as `/applications`' CV column (inline in `ApplicationsTable.tsx`); `—` on a
    row with no application. Six columns now: the dialog widened to `max-w-3xl`.
  - **Details in a new tab.** `DetailsLink` gets `newTab?: boolean` → `target="_blank"`;
    only `CompanyHistoryModal` passes it.
  - **The current row in view.** Once the rows arrive, `scrollIntoView({ block:
    'nearest' })` on the `row-current` row, once per open — not again on a refetch.
    The newest-first order stays.
  - **Tests.** The CV cell for an applied row with and without a tailored resume and
    for a row with no application; the modal's Details link has `target="_blank"`, a
    table's does not; `scrollIntoView` is called once on the current row (jsdom has no
    `scrollIntoView` — stub it).

- [x] **4 · The salary label and the toaster's theme.** — *2026-10-02.* `npm test`
  407/407. The store reads storage once, at module load, so `theme.test.ts` loads a
  fresh copy per `useTheme` test (`vi.resetModules()`). The phase's six backlog rows
  are archived; the `salaryInListing` rename is a new open row.
  - **Salary.** `VacancyPage.tsx`'s `Fact` "Salary in listing" → "Salary";
    `ApplyDialog.tsx`'s "Salary / rate in the listing" → "Salary / rate".
  - **Toaster.** `useTheme` reads one shared state through `useSyncExternalStore`: a
    module-level store in `lib/theme.ts` (the stored value, a subscriber set, `toggle`
    notifies). `ThemeToggle` and `main.tsx`'s `ThemedToaster` then see the same click.
    No context, no new dependency.
  - **Tests.** The labels; a toggle re-renders a second `useTheme` consumer.

- [x] **5 · A toast after every successful write.** — *2026-10-02.* `npm test` 430/430
  (with 6, 7). A negative toast check names its toast (`not.toHaveBeenCalledWith(...)`),
  never a bare `not.toHaveBeenCalled()`: a save left in flight by an earlier test can
  resolve into the next test's spy (seen once on the decline test).
  - From `onSuccess`, never next to `mutate()` (phase 2.2 finding 1). `toastMoved(status,
    { title, company })` beside `STATUS_LABELS` in `pages/vacancies/constants.ts`:
    "Moved to <label>", "<title> — <company>" under it.
  - /vacancies' `actionMutation` (Apply keeps "Application submitted!"); /applications'
    status move and edit ("Application updated"); the vacancy page's triage and
    pipeline moves and "Comment added".
  - **Tests.** A `vi.spyOn(toast, 'success')` per place; a refused move does not toast;
    a decline toasts only after its confirm.

- [x] **6 · The review card fills the funnel card's height.** — *2026-10-02.* Not seen
  in a browser (no browser tool connected): `contain: size` and the 980px reset are
  unverified on screen.
  - `REVIEW_QUEUE_SIZE` 5 → 10. `.dash-grid` loses `items-start` (both cards stretch);
    the review list sits in `.review-scroll` (`flex: 1; overflow-y: auto; contain:
    size`), so it adds no height to the row and scrolls inside it. The one-column
    `@media` block resets it to `contain: none`.
  - **Tests.** The queue asks for and renders ten. Layout itself needs a browser.

- [x] **7 · One company, whatever its spelling.** — *2026-10-02.* Live on the dev DB
  after `docker compose restart api mcp`: `sameCompanyAs=contoso` and `=contoso Polska`
  both give 12, `companyMatchCount` 12 on each row. The key forms 20 multi-spelling
  groups on the dev DB, none of them false. The web no longer sends the substring
  `company` param; REST and MCP keep it.
  - Core: `companyKey(name)` next to `companyMatchCounts` in `vacancy.service.ts`;
    `companyMatchCounts` sums a `groupBy` on `company` per key; `sameCompanyNames`
    resolves a name to every stored spelling. A new `sameCompanyAs` filter on both
    `list()`s → `company: { in: names }`, ANDed with the rest.
  - API: `sameCompanyAs?` on `GET /vacancies` and `GET /applications`.
  - Web: the company modal (both queries) and the vacancy page's other vacancies send
    `sameCompanyAs`; the MSW fake mirrors it with lowercased equality.
  - Docs: ADR-0032; ADR-0025 points to it; `contracts.md`.
  - **Tests.** `companyKey` on the dev DB's real pairs and non-matches (iO / Apollo.io,
    Box / Mapbox, Hays / Haystack People); `list({ sameCompanyAs })` and
    `companyMatchCount` equal from either spelling; the API passes the param; the web
    sends it.
