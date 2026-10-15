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

## Status

- [x] **1 · Core layout.** — *2026-10-15.* The `forUser` spec scanned its own folder
  for raw queries; after the move that was `db/` alone, and the test count fell
  silently. It scans `src/` again — a spec that reads files from disk breaks on a move
  without failing.
- [x] **2 · `recommendation` in English only.** — *2026-10-15.* One full `npm test`
  failed two tests the step does not touch (`create-auth.spec`'s production boot, web
  `useVacancies`' short-page count); each passed alone and the next full run was green —
  load timing on this machine, not this change.
