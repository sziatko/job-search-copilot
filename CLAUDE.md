# Job Search Copilot

An analyzer scores vacancies, you triage them, then track what happened to each
application. Four npm workspaces: `packages/core` (domain layer, and the only DB
client), `apps/api` (NestJS REST), `apps/mcp` (MCP server, stdio and HTTP), `apps/web` (React).

## Read first

- [`docs/README.md`](docs/README.md) — the index, and the rules for these docs.
- [`docs/architecture.md`](docs/architecture.md) — the system map. Start here.
- [`docs/contracts.md`](docs/contracts.md) — surfaces other code depends on.
- [`docs/domain-model.md`](docs/domain-model.md) — the two independent axes.
- [`docs/decisions/`](docs/decisions/) — one ADR per load-bearing decision.
- [`docs/design/`](docs/design/) — visual references (HTML mockups). Not prose; open
  in a browser rather than reading.
- `skills/` — the user's Claude skills that drive the MCP server, uploaded to
  claude.ai by hand. A separate **private** repo (they hold the user's real data),
  cloned into this gitignored folder: a skill change is a commit there, not here. How
  the tools behave is told by the server itself
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
7. **Tests run against a real `job_search_copilot_test` database**, files in parallel,
   each test cleaning up only its own users' rows; integration tests, not Prisma mocks.
8. **Env is loaded by the app entrypoint, validated at boot.**
9. **Every REST route is closed by default** — anonymous or machine access is explicit.
10. **No real job-search data in the repo** — made-up companies, ids, rates and counts
    in code, tests, docs and commits, never ones from the dev DB.
11. **Every domain query is scoped to its user** — through `forUser(db, userId)` in
    `core`; another user's row is a 404.
12. **The web UI is built from `components/ui`** — no new component classes in
    `index.css`; a page never imports another page.

## Writing docs and comments

Docs and comments describe the code as it is now, for a reader who has only the repo.
Each rule here closes a way they went stale before.

- **One fact, one home.** A rule, a command or a value lives in one place; everywhere
  else links to it. A comment never restates a value from another file (a threshold,
  a limit) — it names the file.
- **No counts that change** in prose: not "34 ADRs", "15 tools", "~300 rows today". The
  number lives in the code or a test.
- **Rewrite, never append.** When a decision or a behaviour changes, edit the text so it
  reads as if it had always been so. No "Amended in …", "Until …", "was renamed from",
  "used to"; git keeps the history.
- **No process in the product.** No phase, step or review-finding references in code,
  docs or ADRs.
- **Evidence from the dev DB is told without its data.** "One board serves a posting
  with and without the slash", not names or row counts (invariant 10).
- **A comment says *why*, for the spot it sits on.** A deliberate shortcut with a known
  ceiling is a plain `Limit: … Past that: …` comment, never a `ponytail:` tag — that
  plugin convention does not apply in this repo.
- **One sentence per table cell.** More is a section of its own.
- **Code that deletes data checks its target first** (the database name), as
  `vitest.test-db.ts`, `resetToSeed` and `e2e/db.ts` do; never trust an env fallback.
- **When code changes, its docs change in the same commit.** Grep the old name across
  `docs/`, comments and tests before calling a rename done.

## Commands

    npm test           # vitest; needs the test DB — see ADR-0015
    npm run lint       # biome check .
    npm run typecheck  # builds core first, then tsc --noEmit on the apps and e2e
    npm run migrate:dev

All four are root-only — no workspace defines them. One project only:
`npm test -- --project web` (or `core`, `api`, `mcp`); web needs no database. Mid-step,
run just the projects the change touches; the full `npm test` still gates the
checkbox. A core edit touches api and mcp too — they read core's `dist/`, which the
Docker `core` watcher rebuilds (without the stack up, `npm run build
--workspace=@job-search-copilot/core` first). The full list, including the
per-app dev servers, is in [`docs/development.md` § Scripts](docs/development.md#scripts-repo-root).

**End-to-end (`npm run test:e2e`, Playwright, [ADR-0037](docs/decisions/0037-e2e-playwright.md))
is not part of `npm test` and does not gate a step's checkbox.** Run it only: the spec of
the area you change, when you edit a feature it covers (`npm run test:e2e -- vacancies`);
the full set before a push or PR. CI runs it on pull requests.

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
- **The phase doc is never committed.** A step's commit leaves it out; it is deleted
  when the phase ends. Before that, a gotcha that outlives the phase moves to
  [`docs/development.md`](docs/development.md), `prisma/README.md` or a code comment.

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

**Chaining steps.** When the user says "виконуй кроки N–M ланцюжком", load the
`chain-steps` skill ([`.claude/skills/chain-steps/`](.claude/skills/chain-steps/SKILL.md))
and follow it: each step in a fresh subagent, the main session verifies and commits.
