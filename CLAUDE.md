# Job Search Copilot

An analyzer scores vacancies, you triage them, then track what happened to each
application. Four npm workspaces: `packages/core` (domain layer, and the only DB
client), `apps/api` (NestJS REST), `apps/mcp` (stdio MCP server), `apps/web` (React).

## Read first

- [`docs/README.md`](docs/README.md) — the index, and the rules for these docs.
- [`docs/architecture.md`](docs/architecture.md) — the system map. Start here.
- [`docs/contracts.md`](docs/contracts.md) — surfaces other code depends on.
- [`docs/domain-model.md`](docs/domain-model.md) — the two independent axes.
- [`docs/decisions/`](docs/decisions/) — 28 ADRs, one per load-bearing decision.
- [`docs/design/`](docs/design/) — visual references (HTML mockups). Not prose; open
  in a browser rather than reading.
- [`skills/`](skills/) — the user's Claude skills that drive the MCP server, kept here
  and uploaded to claude.ai by hand. How the tools behave is told by the server itself
  (the tool descriptions — the one copy every client shows; `SERVER_INSTRUCTIONS` in
  `apps/mcp/src/server.ts` only summarises them, Claude Desktop drops it), never by a
  skill; a skill holds only the user's workflow. A tool rename or a changed field →
  update the skills that call it in the same step, and tell the user to re-upload them.

## Invariants

Load-bearing, and they break **silently** — nothing fails to compile when one is
violated. Reasoned through, with the ADR that owns each:
[`architecture.md` § System invariants](docs/architecture.md#system-invariants).
Quote them from there if you change one; keep this list in step.

1. **`packages/core` is the only database client.**
2. **A vacancy is analysed once** — it can exist before its analysis (`NEW`).
3. **`recommendation` is the analyzer's; `status` is the user's** — except the one move
   out of `NEW` that an analysis makes (`SKIP` → `FILTERED_OUT`, else `NOT_REVIEWED`).
4. **`recommendation` is stored canonical-English.**
5. **The web app's API contract is a hand-written zod schema**, not a `core` import.
6. **`apps/api` disables Biome's `useImportType`.**
7. **Tests run against a real `job_search_copilot_test` database**, sequentially
   (`fileParallelism: false`), and are integration tests, not Prisma mocks.
8. **Env is loaded by the app entrypoint, validated at boot.**

## Commands

    npm test           # vitest; needs the test DB — see ADR-0015
    npm run lint       # biome check .
    npm run typecheck  # builds core first, then tsc --noEmit on the three apps
    npm run migrate:dev

All four are root-only — no workspace defines them. One project only:
`npm test -- --project web` (or `core`, `api`, `mcp`); web needs no database. Mid-step,
run just the projects the change touches; the full `npm test` still gates the
checkbox. A core edit touches api and mcp too — they read core's `dist/`, which the
Docker `core` watcher rebuilds (without the stack up, `npm run build
--workspace=@job-search-copilot/core` first). The full list, including the
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
  step must know and the code cannot show: a path left unvalidated, an operational
  gotcha. Not what was built — that is in the code. A deferral or a new idea goes to
  [`docs/backlog.md`](docs/backlog.md), not into the phase doc.
- Mid-step, `/compact` is the right tool. At a step boundary it is not: the next
  step needs none of the previous one, and the phase doc already carries it.

**Chaining steps.** When the user says "виконуй кроки N–M ланцюжком", run each step in a
fresh `general-purpose` subagent (never `fork`). The main session only coordinates:

- Brief each subagent: this phase doc, step K only; reuse what earlier steps' checkbox
  notes name; no commit, no dev-DB migration; STOP and return a question the plan
  cannot answer.
- Verify each step yourself: `git status`, lint, typecheck, the full `npm test` (summary
  only). One rerun of a project that failed on a known flake; red again → stop.
- Green → commit the step without asking (the user's chain request is the approval).
- A subagent that stopped (a question, a rate limit) is resumed with `SendMessage`,
  not restarted. A dev-DB migration waits for the user's go-ahead.
- The next step may run in the background while the user answers about the last one.
- End with one report: per step, stops and why, divergences, cost.
