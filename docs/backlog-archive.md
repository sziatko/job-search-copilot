# Backlog archive

Rows moved out of [`backlog.md`](backlog.md) once done or no longer relevant — kept for
history, not read when planning. Newest at the top.

| Item | Kind | Outcome | From | Notes |
| --- | --- | --- | --- | --- |
| **Arrow keys and the `role="menu"` contract** | fix | not relevant (2026-10-01) | phase 2.2 (finding 7) | The ⋯ menu is gone (phase 4.2 step 9): every status has its own row button, so there is no `role="menu"` to honour. |
| **`hasAnalysis` list filter** | fix | not relevant (2026-09-29) | phase 2.2 | Its one reason was the dashboard's analysed-count tile; phase 4.1 step 4 dropped `analysed` from `/stats` and starts the funnel at Recommended. |
| **Store the application timeout in the DB, set by an automation** | fix | not relevant (2026-09-28) | 2026-09-28 | The timeout stays derived in core (`timedOutWhere` in `packages/core/src/status.ts`, 30 days): it never writes `status` or a `StatusChange` row, so a timed-out application never shows in Recent activity. A job writing a stored value is what the user did not want. Phase 4.1 shows the count on the dashboard instead. |
| **`/log` page — a web view of the vacancy log** | idea | done — phase 4 step 1 | phase 2, phase 3 | `/log`: a searchable, infinitely scrolled table of `VacancyLogEntry`. No add-entry form — the search box is the whole form; the mockup's Source / Status / Score / Note columns stay out (nothing stores them). |
| **Dashboard on real data** | idea | done — phase 4 step 3 | 2026-09-28 | `GET /stats` counts in core over the `StatusChange` journal ("ever reached this stage"); the first KPI tile is Logged (ADR-0031). |
| **A page for one vacancy** | idea | done — phase 4 step 5 | 2026-09-28 | `/vacancies/$id`: posting text, status timeline (`GET /vacancies/:id` `timeline`), comments with an add form, details, the company's other vacancies, status actions. Reached by the → button in the tables; the title stays the posting link. |
| **Infinite loading on `/vacancies` and `/applications`** | fix | done — phase 4 steps 2, 4 | 2026-09-27 | Prisma cursor paging (ADR-0030); the server filters, sorts and counts; the timeout rule moved to core. |
| **`/tracker` server-side pagination / search / stats** | fix | not relevant (2026-09-27) | phase 2, phase 2.1 | `/tracker` is `/applications` now; the backlog's infinite-loading row covers the same need. |
| **An explicit "analysed" column** | fix | not relevant (2026-09-27) | phase 2.2 (finding 11) | `hasAnalysis` was a projection over the `'N/A'` sentinel. Since phase 3.1 it reads whether an `ANALYZER` comment exists — an honest signal, with no sentinel left. |
| **Ambiguous-match resolution UI** | idea | not relevant (2026-09-27) | phase 2 | The web records by `vacancyId` since phase 3.1, so it never meets `AmbiguousVacancyMatchError`. Over MCP the error lists the candidate ids and the skill routes the email to need-attention. |
| **`get_application` MCP tool** | idea | not relevant (2026-09-27) | phase 2 | Merged away: an application is a `Vacancy` row, and `get_vacancy` returns its status and comments. |
| **The Comment column prints `N/A` for placeholders** | fix | done — phase 3.1 step 3 | phase 2.2 | The migration dropped the `'N/A'` sentinel instead of copying it into `Comment`; a placeholder has no comment and the column shows `—`. |
| **Comments on vacancies** | idea | done — phase 3.1 step 3 | phase 3 | One `Comment` table with a `source`, on the vacancy. |
| **Rewrite the `all-vacancy-log` skill to call `check_vacancy_log*`** | fix | done — phase 3 | phase 3 | `skills/vacancy-evaluator` checks the log through the JSC tools. |
| **`ApplyDialog` form fields persist** | fix | done — phase 2 | phase 1 | Salary, tailored resume and comment are saved through `POST /api/v1/applications`. |
