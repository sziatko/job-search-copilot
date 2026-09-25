# Job Search Copilot

An analyzer scores vacancies, you triage them, then track what happened to each
application. Four npm workspaces: `packages/core` (domain layer, and the only DB
client), `apps/api` (NestJS REST), `apps/mcp` (stdio MCP server), `apps/web` (React).

## Read first

- [`docs/README.md`](docs/README.md) — the index, and the rules for these docs.
- [`docs/architecture.md`](docs/architecture.md) — the system map. Start here.
- [`docs/contracts.md`](docs/contracts.md) — surfaces other code depends on.
- [`docs/domain-model.md`](docs/domain-model.md) — the two independent axes.
- [`docs/decisions/`](docs/decisions/) — 25 ADRs, one per load-bearing decision.
- [`docs/design/`](docs/design/) — visual references (HTML mockups). Not prose; open
  in a browser rather than reading.

## Invariants

Load-bearing, and they break **silently** — nothing fails to compile when one is
violated. Reasoned through, with the ADR that owns each:
[`architecture.md` § System invariants](docs/architecture.md#system-invariants).
Quote them from there if you change one; keep this list in step.

1. **`packages/core` is the only database client.**
2. **A vacancy is analysed once.**
3. **`recommendation` is the analyzer's; `userAction` is the user's.**
4. **`recommendation` is stored canonical-English.**
5. **The web app's API contract is a hand-written zod schema**, not a `core` import.
6. **`apps/api` disables Biome's `useImportType`.**
7. **Tests run against a real `job_search_copilot_test` database**, sequentially
   (`fileParallelism: false`), and are integration tests, not Prisma mocks.
8. **Env is loaded by the app entrypoint, validated at boot.**
9. **Every `Application` links 1:1 to an `EstimatedVacancy`.**

## Commands

    npm test           # vitest; needs the test DB — see ADR-0015
    npm run lint       # biome check .
    npm run typecheck  # builds core first, then tsc --noEmit on the three apps
    npm run migrate:dev

All four are root-only — no workspace defines them. The full list, including the
per-app dev servers, is in the root [`README.md` § Scripts](README.md#scripts-repo-root).

## Phase workflow

A conversation's cost grows with its length — every request re-sends the whole
history. A phase is far too big to carry in one session, so it is planned and
worked in **steps**.

**When planning a phase** (writing `docs/phases/phase-N.md`, per
[`docs/README.md`](docs/README.md)):

- Break the phase into steps that are **independently completable** — each can be
  finished and verified without the next one existing. Two pieces that cannot be
  separated are one step, not two.
- Give the doc a `## Status` section listing every step as a checkbox, in order.

**When working a phase:**

- **One step per session.** Read the phase doc for the first unchecked step; do
  that one only.
- **A step carries its own tests.** Write them as part of the step — the plan *is*
  the agreement, so nothing waits for a second review. Do not tick the checkbox
  until `npm test` has run green in *this* session; an earlier session's green run
  is not evidence. Report the real output, then wait for an explicit instruction
  before `git commit`.
- **Stop at the step boundary.** Tick its checkbox in `## Status` with the date,
  report what changed, and tell the user to clear the context before the next
  step. Do not roll into the next step in the same session, even when it looks
  small — that is exactly the cost this workflow exists to avoid.
- **Leave the doc true before you stop.** If the step diverged from what the plan
  describes, edit that part of the plan — the next session reads it as fact, and a
  stale plan is worse than none. Beside the checkbox, record only what the next
  step must know and the code cannot show: a deferral, a path left unvalidated, an
  operational gotcha. Not what was built — that is in the code.
- Mid-step, `/compact` is the right tool. At a step boundary it is not: the next
  step needs none of the previous one, and the phase doc already carries it.
