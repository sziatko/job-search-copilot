# Backlog archive

Rows moved out of [`backlog.md`](backlog.md) once done or no longer relevant — kept for
history, not read when planning. Newest at the top.

| Item | Kind | Outcome | From | Notes |
| --- | --- | --- | --- | --- |
| **`/tracker` server-side pagination / search / stats** | fix | not relevant (2026-09-27) | phase 2, phase 2.1 | `/tracker` is `/applications` now; the backlog's infinite-loading row covers the same need. |
| **An explicit "analysed" column** | fix | not relevant (2026-09-27) | phase 2.2 (finding 11) | `hasAnalysis` was a projection over the `'N/A'` sentinel. Since phase 3.1 it reads whether an `ANALYZER` comment exists — an honest signal, with no sentinel left. |
| **Ambiguous-match resolution UI** | idea | not relevant (2026-09-27) | phase 2 | The web records by `vacancyId` since phase 3.1, so it never meets `AmbiguousVacancyMatchError`. Over MCP the error lists the candidate ids and the skill routes the email to need-attention. |
| **`get_application` MCP tool** | idea | not relevant (2026-09-27) | phase 2 | Merged away: an application is a `Vacancy` row, and `get_vacancy` returns its status and comments. |
| **The Comment column prints `N/A` for placeholders** | fix | done — phase 3.1 step 3 | phase 2.2 | The migration dropped the `'N/A'` sentinel instead of copying it into `Comment`; a placeholder has no comment and the column shows `—`. |
| **Comments on vacancies** | idea | done — phase 3.1 step 3 | phase 3 | One `Comment` table with a `source`, on the vacancy. |
| **Rewrite the `all-vacancy-log` skill to call `check_vacancy_log*`** | fix | done — phase 3 | phase 3 | `skills/vacancy-evaluator` checks the log through the JSC tools. |
| **`ApplyDialog` form fields persist** | fix | done — phase 2 | phase 1 | Salary, tailored resume and comment are saved through `POST /api/v1/applications`. |
