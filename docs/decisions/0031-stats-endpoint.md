# 0031 — One stats endpoint; the funnel counts the journal

- Status: Accepted · Date: 2026-09

## Context
The dashboard shows a funnel and counters; `/applications` shows a strip of pipeline
counts. Counting from list responses fails twice: a list counts only the current
status — a vacancy that got a reply and was then rejected is `REJECTED` now, so the
funnel would shrink every time a company says no — and the paged tables
([ADR-0030](0030-cursor-paging.md)) never hold the whole pipeline in the browser. The
`StatusChange` journal ([ADR-0029](0029-one-vacancy-table.md)) records every move, so
"ever reached this stage" is a question the database can answer.

## Decision
**`GET /api/v1/stats`**, computed in core (`StatsService.get()`). The dashboard and the
`/applications` strip read it; neither loads a list to count.

| Field | Counts |
| --- | --- |
| `logged` | every vacancy, analysed or not |
| `awaitingAnalysis` | `status = NEW` |
| `awaitingTriage` | `status = NOT_REVIEWED` |
| `recommended` | `recommendation in (APPLY, APPLY_WITH_CAVEATS)` |
| `notRecommended` | `status = FILTERED_OUT` or `recommendation = SKIP`, each vacancy once |
| `applied` | vacancies with an `APPLIED` journal row, ever |
| `declined` | currently `DECLINED` |
| `unavailable` | currently `UNAVAILABLE` |
| `responded` | with an `ACTION_NEEDED`, `INTERVIEW`, `AWAITING` or `OFFER` row, ever |
| `interview` | with an `INTERVIEW` or `OFFER` row, ever |
| `actionNeeded` | currently `ACTION_NEEDED` — the user's move |
| `pipeline` | the strip: `byStatus` (current), `active`, `timedOut`, `total` |
| `recent` | the 6 latest **pipeline** `StatusChange` rows, with company and title |

The funnel is Logged → Recommended → Applied → Got a response → Interview: past
Recommended it counts the journal. Under it, "Dropped out": not recommended
(`notRecommended`), declined, unavailable, rejected (`pipeline.byStatus.REJECTED`),
timed out (`pipeline.timedOut`).

`pipeline` uses the timeout rule in core ([ADR-0022](0022-timeout-derived-until-scheduled.md)).
The `/applications` list filters by it with its own param, `state=active|timedOut`,
beside `status` (pipeline statuses only); the two AND.

## Why this and not the alternatives
- **`limit=1` list calls** — a request per number, and a list counts only the current
  state.
- **The funnel from the current `status`** — every rejection erases the stages it
  passed through.
- **Stats over MCP** — no skill asks for them.

## Consequences
- The dashboard costs one request plus its review queue
  (`GET /vacancies?status=NOT_REVIEWED&sort=recommended&limit=10`).
- The funnel only grows.
- `/stats` is one more shape in the hand-written web contract
  ([ADR-0012](0012-web-hand-written-contract.md)). Every status write invalidates
  `['stats']`.

## What this constrains — breaks if you change it
- **A funnel stage must count the journal, not `status`.** The core test for a
  replied-then-rejected vacancy guards it.
- **`pipeline` must partition**: `total = active + timedOut + REJECTED + OFFER`.
- **The timeout rule exists once, in core.**
- **`status` written outside `writeStatus`** → the journal is short, and every "ever"
  count with it.

## Related
[ADR-0022](0022-timeout-derived-until-scheduled.md), [ADR-0029](0029-one-vacancy-table.md),
[`../contracts.md`](../contracts.md).
