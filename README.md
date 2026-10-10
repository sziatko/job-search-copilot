# Job Search Copilot

A personal tool for running a job search: vacancies are analyzed against its owner's
profile (match score + recommendation + reasoning), stored once, and then tracked
through the states that matter — *not reviewed → ready to apply → applied / declined*.

The analysis itself is produced elsewhere (the `vacancy-match-analyzer` prompt).
This repo is the plumbing around it: somewhere to keep the results and a UI to work
through them.

## Architecture

npm-workspaces monorepo:

| Package | What it is |
| --- | --- |
| [`packages/core`](packages/core/README.md) | Domain layer — Prisma schema/client, `VacancyService`, recommendation normalization, domain errors. Framework-agnostic; shared by `api` and `mcp`. |
| `apps/api` | NestJS REST API (`/api/v1`), the backend for the web app. |
| `apps/mcp` | MCP server exposing the same operations as tools, so Claude can save/query analyzed vacancies directly. |
| `apps/web` | React 19 + Vite + Tailwind dashboard. |

```
vacancy-match-analyzer ──▶ apps/mcp (MCP tools) ─┐
                                                 ├─▶ packages/core ─▶ PostgreSQL
                          apps/web ──▶ apps/api ─┘
```

Stack: Node 24, PostgreSQL 17, Prisma 7, NestJS 12, React 19, Vitest, Biome.

## Getting started

Prerequisites: Docker (with Compose) and — for running scripts on the host —
Node 24.

```bash
cp .env.example .env
npm install
npm run generate                # the Prisma client; npm install does not make it
docker compose up -d            # postgres + api + mcp + web + a core build watcher

# First run only: create the schema and the separate test database
npm run migrate:dev             # dev DB (job_search_copilot)
docker compose exec postgres psql -U postgres -c "CREATE DATABASE job_search_copilot_test"
npm run test:db:migrate         # test DB (job_search_copilot_test)
```

**The owner's fresh clone.** Git does not clone these, so after a new `git clone`:

- the skills: `git clone https://github.com/sziatko/job-search-copilot-skills.git skills`
  (private; without it the skill↔MCP sync test in `apps/mcp` skips), then an empty
  `skills/.git/info/publish-guard-off` — that repo holds real data on purpose;
- `git config user.name` / `user.email` in both repos, if git has no global identity
  (the GitHub noreply address).

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:3000/api/v1 · health at http://localhost:3000/health · docs (Swagger UI) at http://localhost:3000/api/docs |
| MCP over HTTP | http://localhost:3001/mcp — OAuth: sign in on the web, then consent ([ADR-0035](docs/decisions/0035-mcp-over-http-oauth-resource-server.md)) |
| Postgres | `localhost:5432` (`postgres` / `postgres`) |

The `mcp` container idles (`sleep infinity`); a session connects by `docker exec`
into it and running `npm run dev:mcp`. `mcp-http` serves the same tools over HTTP for
remote clients: `claude mcp add --transport http jsc http://localhost:3001/mcp`, or the
MCP Inspector with transport *Streamable HTTP* and that URL.

> After changing dependencies or `packages/core/prisma/schema.prisma`, the
> containers' `node_modules` / generated client go stale — re-run
> `docker compose exec <svc> npm install` / `npm run generate`, or
> `docker compose up -d --build`.

## Scripts (repo root)

| Command | |
| --- | --- |
| `npm run dev:api` / `npm run dev:mcp` | run a service on the host instead of in Docker |
| `npm run dev:mcp:http` | MCP over Streamable HTTP on the host (`MCP_HTTP_PORT`, behind OAuth; needs the API up) |
| `npm run mcp:inspect` | the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) web UI over the MCP server (stdio, needs `.env`) — browse the tools and call them |
| `npm test` / `npm run test:watch` | Vitest across all workspaces (needs the test DB) |
| `npm run lint` / `npm run lint:fix` / `npm run format` | Biome |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run build` | build all workspaces |
| `npm run generate` | regenerate the Prisma client |
| `npm run migrate:dev` | create + apply a migration on the dev DB |
| `npm run test:db:migrate` | apply committed migrations to the test DB |
| `npm run studio` | Prisma Studio |

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build against a
Postgres service on every push and PR.

## Design docs

[`docs/`](docs/) holds the **why**: the architecture map, the domain model, the
API/MCP contracts, and an ADR per load-bearing decision — each with a "what breaks
if you change it" note. Start at [`docs/README.md`](docs/README.md);
[`docs/phases/phase-1.md`](docs/phases/phase-1.md) is the Phase 1 ledger.

Database and migration conventions: [`packages/core/prisma/README.md`](packages/core/prisma/README.md).

## License

MIT — see [LICENSE](LICENSE).
