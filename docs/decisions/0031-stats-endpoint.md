# 0031 — One stats endpoint; the funnel counts the journal, and timeout moves to core

- Status: Accepted (amended in phase 7.2: `recruiterScreen` → `actionNeeded`, `REPLIED` gone)
- Phase: 4   ·   Date: 2026-09

## Context

The dashboard counted from list responses: four `limit=1` requests read `total` off
`GET /vacancies` (`apps/web/src/pages/dashboard/api.ts`), and `/applications`' KPI
strip counted the pipeline in the browser over a 500-row loop. Three things were wrong
with that:

- **The funnel read each vacancy's current `status`.** A vacancy that got a reply and
  was then rejected is `REJECTED` now, so it dropped out of "got a response" — the
  funnel shrank every time a company said no.
- **"Postings" counted `Vacancy` rows**, importer placeholders included, not what the
  log saw.
- **With infinite scroll ([ADR-0030](0030-cursor-paging.md)) the browser no longer
  holds the whole pipeline**, so it cannot count Active / Timeout, and cannot filter by
  them either. The timeout rule ([ADR-0022](0022-timeout-derived-until-scheduled.md))
  lived in the web, which cannot share code with the server (invariant 5).

The `StatusChange` journal ([ADR-0029](0029-one-vacancy-table.md)) records every move,
so "ever reached this stage" is a question the database can answer.

## Decision

**`GET /api/v1/stats`**, computed in `core` (`StatsService.get()`) in SQL. The
dashboard and the `/applications` KPI strip read it; neither loads a list to count.

| Field | Meaning |
| --- | --- |
| `logged` | every vacancy, analysed or not (was the `VacancyLogEntry` count — [ADR-0033](0033-unscored-vacancies-in-one-table.md)) |
| `awaitingAnalysis` | `status = NEW` — the analysis queue, text or not (phase 5) |
| `awaitingTriage` | `status = NOT_REVIEWED` |
| `recommended` | `recommendation in (APPLY, APPLY_WITH_CAVEATS)` |
| `notRecommended` | `status = FILTERED_OUT` **or** `recommendation = SKIP`, each vacancy once (phase 5) |
| `applied` | vacancies with an `APPLIED` journal row, ever |
| `declined` | … currently `DECLINED` (the user's no) |
| `unavailable` | … currently `UNAVAILABLE` (the posting stopped taking applications) |
| `responded` | … with an `ACTION_NEEDED`, `INTERVIEW`, `AWAITING` (phase 6.1) or `OFFER` row, ever (`REPLIED` and `RECRUITER_SCREEN` until phase 7.2) |
| `interview` | … with an `INTERVIEW` or `OFFER` row, ever |
| `actionNeeded` | … currently in `ACTION_NEEDED` — the user's move (`recruiterScreen` until phase 7.2) |
| `pipeline` | the `/applications` strip: `byStatus` (current), `active`, `timedOut`, `total` |
| `recent` | the latest `StatusChange` rows, with company and title |

The funnel is Logged → Recommended → Applied → Got a response → Interview. Its
stages past Recommended count the journal ("ever reached"); `pipeline` counts the
current status. Under it, "Dropped out": not recommended (`notRecommended` since
phase 5; `logged − recommended`, floored at 0, before), declined (`declined`), no longer accepting applications
(`unavailable`, added in phase 4.2 step 8), rejected (`pipeline.byStatus.REJECTED`), timed
out (`pipeline.timedOut`).

*Amended in phase 4.1 step 4:* the funnel's second stage was Analysed (`analysed`,
vacancies with an `ANALYZER` comment). The importer's placeholders
([ADR-0019](0019-record-or-create-vacancy.md)) have none, so it came out smaller than
Recommended; `analysed` was dropped and `declined` added.

*Amended in phase 5 step 5:* with the log merged into `Vacancy`
([ADR-0033](0033-unscored-vacancies-in-one-table.md)), `logged − recommended` also
counted every vacancy still waiting for its analysis. "Not recommended" is
`notRecommended` now, counted on the one table: what is `FILTERED_OUT` (the analyzer's
`SKIP`, the user's, the migrated log) or was analysed `SKIP` (whatever its status since).
`awaitingAnalysis` (`status = NEW`) is a dashboard tile of its own.

**The timeout rule moves to `core`.** Still derived, still 30 days, still
`statusChangedAt` and "not `REJECTED` / `OFFER`" — but `TIMEOUT_DAYS` lives in core.
`stats.pipeline` counts it (step 3); the `/applications` list takes the Active /
Timeout filters and each item carries `timedOut: boolean` (step 4). The web drops
`isTimedOut` / `isActive` / `TIMEOUT_DAYS`; the server sends the answer.

The filter is its own query param, `state=active|timedOut`, beside `status` — not
extra values of `status`, which stays pipeline statuses only. The two AND; neither is
All.

## Why this and not the alternatives

- **Keep counting through `limit=1` list calls.** One request per number, and a list
  can only count current state — the funnel needs "ever".
- **Count the funnel from current `status`.** Simple, and wrong in the way above:
  every rejection erases the earlier stages it passed through.
- **Stats in MCP too.** No skill asks for it; phase 4 leaves MCP and the skills
  unchanged.
- **Keep the timeout rule in the web and mirror it in core.** Two copies of one rule,
  kept in step by hand, for a flag the server has to compute anyway to filter.
- **Store timeout now, written by a daily job.** Still the target (backlog), but it
  needs a scheduler the stack does not have. With the rule in one place in core, that
  job later changes one place.

## Consequences

- The dashboard costs one request plus the review queue
  (`GET /vacancies?status=NOT_REVIEWED&sort=recommended&limit=10` since phase 4.3,
  enough to fill the funnel card's height).
- The funnel only grows; a rejection no longer shrinks earlier stages.
- `/stats` is a new shape in the hand-written web contract
  ([ADR-0012](0012-web-hand-written-contract.md)).
- Journal rows migrated in phase 3.1 were backfilled from the old columns, so for old
  vacancies "ever" is as good as that backfill.

## What this constrains — breaks if you change it

- **A funnel stage must count the journal, not `status`.** Switching `responded` to
  `status in (…)` passes every test that never rejects a replied vacancy — the core
  test for a replied-then-rejected vacancy is the guard.
- **`pipeline` must still partition**: `total = active + timedOut + REJECTED + OFFER`.
  A rule change that breaks that shows as a strip that does not add up.
- **`TIMEOUT_DAYS` exists once, in core.** A web copy would let the strip, the filter
  and the ⏳ disagree — the failure ADR-0022 guarded against inside the web.
- **Writing `status` outside `writeStatus`** leaves the journal short, and every
  "ever" count with it.

## Related

- [ADR-0022](0022-timeout-derived-until-scheduled.md) — the timeout rule; phase 4
  step 3 updates it to say the rule lives in core.
- [ADR-0029](0029-one-vacancy-table.md) — the `StatusChange` journal.
- [ADR-0024](0024-web-shell-and-theme.md) — the dashboard.
- [`../phases/phase-4.md`](../phases/phase-4.md) § Stats, § Timeout rule moves to core.
- [`../contracts.md`](../contracts.md) — the `GET /stats` row.
