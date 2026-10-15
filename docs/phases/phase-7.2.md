# Phase 7.2: tidying the codebase

## Goal

Small clean-ups after the `packages/core` review (PR #7), each its own step and
commit. More steps are added here as the user and Claude agree on them; a step is
discussed before it is planned.

## Steps

**1 · Core layout.** `packages/core/src` by feature, as `apps/api` is laid out:
`db/`, `domain/`, `vacancies/`, `applications/`, `intake/`, `stats/` (`auth/` and
`seed/` as before). Files moved, not changed; `src/index.ts` stays the one public
surface. The layout and where a new file goes: `architecture.md` § Inside
`packages/core/src`.

**2 · `recommendation` in English only.** The skills send `APPLY`,
`APPLY_WITH_CAVEATS`, `SKIP`; the Ukrainian aliases an older analyzer needed go.
`RECOMMENDATION_INPUT_VALUES` is deleted — the input is the Prisma `Recommendation`
enum: `z.enum(Recommendation)` in MCP (one enum for input and filter),
`@IsEnum(Recommendation)` in the REST DTOs. `normalizeRecommendation` becomes
`parseRecommendation`: an exact enum check that throws `InvalidRecommendationError`,
no trimming or case folding. The skills need no change.

**3 · Pipeline statuses say whose move it is.** `RECRUITER_SCREEN` was set for a
recruiter's question, not a screening call; `REPLIED` for the user's own reply — the
company's move next, which is `AWAITING`. Now `APPLIED` (waiting for a first answer),
`ACTION_NEEDED` (the company wrote, the user must act: a question, a call to book, a
test task — `RECRUITER_SCREEN` renamed, rows kept), `INTERVIEW`, `AWAITING` (the user
answered or did it, waiting on the company — `REPLIED`'s rows moved here), `OFFER`,
`REJECTED`. Migration `20261015120000_action_needed_status` rebuilds the enum (Postgres
cannot drop a value), the `Vacancy_new_is_unanalysed` CHECK dropped and re-added around
it. `GET /stats`' `recruiterScreen` → `actionNeeded` (the dashboard's "N need your
reply"). The skill `application-status-tracker` maps the Gmail labels anew: "Питання від
рекрутера" → `ACTION_NEEDED`, "Відповів" → `AWAITING`.

## Status

- [x] **1 · Core layout.** — *2026-10-15.* The `forUser` spec scanned its own folder
  for raw queries; after the move that was `db/` alone, and the test count fell
  silently. It scans `src/` again — a spec that reads files from disk breaks on a move
  without failing.
- [x] **2 · `recommendation` in English only.** — *2026-10-15.* One full `npm test`
  failed two tests the step does not touch (`create-auth.spec`'s production boot, web
  `useVacancies`' short-page count); each passed alone and the next full run was green —
  load timing on this machine, not this change.
- [x] **3 · Pipeline statuses say whose move it is.** — *2026-10-15.* Prisma does not
  wrap a migration in a transaction: the first e2e run applied this one half way (the
  `e2e_snapshot` schema's copied tables held the old enum, so `DROP TYPE` failed). The
  file is now `BEGIN; … COMMIT;` — a forced failure through Prisma rolled back fully —
  and `e2e/prepare-db.ts` drops the snapshot before migrating. The edit changed the
  file's checksum; the dev and test DBs' `_prisma_migrations` rows were set to it.
  `20261011130000_vacancy_owner`'s "runs as one transaction" comment is wrong too, left
  as applied. Dev DB after migrating: row counts unchanged, `RECRUITER_SCREEN`'s journal
  rows now `ACTION_NEEDED`, `REPLIED`'s `AWAITING`. The skill change is in the `skills/`
  repo — re-upload `application-status-tracker`. Its Gmail labels are now named as the
  web's statuses (Applied, Action needed, Interview, Awaiting, Offer, Rejected, No
  response); the user renames them by hand, the skill lists the old → new mapping. The
  README screenshots are retaken; on `/applications` the Applied tile is hidden in the picture only,
  so the nine tiles fit one row. `prisma/README.md` gains rule 6 (`BEGIN`/`COMMIT`).
