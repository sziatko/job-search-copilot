# Job Search Copilot

An analyzer scores vacancies, you triage them, then track what happened to each
application. Four npm workspaces: `packages/core` (domain layer, and the only DB
client), `apps/api` (NestJS REST), `apps/mcp` (stdio MCP server), `apps/web` (React).

## Read first

- [`docs/README.md`](docs/README.md) — the index, and the rules for these docs.
- [`docs/architecture.md`](docs/architecture.md) — the system map. Start here.
- [`docs/contracts.md`](docs/contracts.md) — surfaces other code depends on.
- [`docs/domain-model.md`](docs/domain-model.md) — the two independent axes.
- [`docs/decisions/`](docs/decisions/) — 22 ADRs, one per load-bearing decision.
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
