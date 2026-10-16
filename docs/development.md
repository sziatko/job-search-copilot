# Development

How to run Job Search Copilot locally, and the scripts that work on it. What the app is
and why it is shaped this way: the root [`README.md`](../README.md) and
[`architecture.md`](architecture.md).

## Getting started

Prerequisites: Docker (with Compose) and — for running scripts on the host —
Node 24.

```bash
cp .env.example .env
cp .env.test.example .env.test  # npm test; it refuses any database but *_test
cp .env.e2e.example .env.e2e    # npm run test:e2e
npm install
npm run generate                # the Prisma client; npm install does not make it
docker compose up -d            # postgres + api + mcp + web + a core build watcher

# First run only: create the schema and the separate test database
npm run migrate:dev             # dev DB (job_search_copilot)
docker compose exec postgres psql -U postgres -c "CREATE DATABASE job_search_copilot_test"
npm run test:db:migrate         # test DB (job_search_copilot_test)
```

`npm test -- --project web` needs no database.

Signing in needs a Google or LinkedIn OAuth client (redirect URIs in `.env.example`)
and your email in `AUTH_ALLOWED_EMAILS`; a passkey can be added on `/profile` after
the first sign-in ([ADR-0034](decisions/0034-auth-better-auth-in-core.md)).

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
| MCP over HTTP | http://localhost:3001/mcp — OAuth: sign in on the web, then consent ([ADR-0035](decisions/0035-mcp-over-http-oauth-resource-server.md)) |
| Postgres | `localhost:5432` (`postgres` / `postgres`) |

The `mcp` container idles (`sleep infinity`); a session connects by `docker exec`
into it and running `npm run dev:mcp`. `mcp-http` serves the same tools over HTTP for
remote clients: `claude mcp add --transport http jsc http://localhost:3001/mcp`, or the
MCP Inspector with transport *Streamable HTTP* and that URL.

**API keys** ([ADR-0039](decisions/0039-api-keys-per-user.md)) — create one on
`/profile`; it is shown once. The stdio MCP acts as the key's owner and refuses to boot
without a valid one: `JSC_API_KEY=jsc_…` in the repo-root `.env` (mounted into the `mcp`
container; `apps/mcp/src/env.ts` loads it). The `env` of Claude Desktop's stdio server
config alone does not reach it: that config runs `docker exec`, so its `env` is set on
the host's `docker` process, not inside the container — to keep the key there, add
`-e JSC_API_KEY` to the `docker exec` arguments, which passes it through. A client
without OAuth reaches the HTTP MCP with `Authorization: Bearer jsc_…`
(`mcp-remote --header`). n8n's credential, the same header on the intake and analysis
routes, holds a key too.

After a change to `core` or its schema, or a new dependency, the containers need a
restart or a rebuild: [`architecture.md` § Dev stack](architecture.md#dev-stack-docker-compose).

## Scripts (repo root)

| Command | |
| --- | --- |
| `npm run dev:api` / `npm run dev:mcp` | run a service on the host instead of in Docker |
| `npm run dev:mcp:http` | MCP over Streamable HTTP on the host (`MCP_HTTP_PORT`, behind OAuth; needs the API up) |
| `npm run mcp:inspect` | the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) web UI over the MCP server (stdio, needs `.env`) — browse the tools and call them |
| `npm test` / `npm run test:watch` | Vitest across all workspaces (needs the test DB) |
| `npm run test:e2e` | Playwright end-to-end over its own api, web and `job_search_copilot_e2e` ([ADR-0037](decisions/0037-e2e-playwright.md)); not part of `npm test` |
| `npm run screenshots` | retake the README's screenshots (`docs/screenshots/`) on the e2e seed, light and dark |
| `npm run seed` | reset the e2e database to the made-up seed (refuses any DB not named `*_e2e` / `*_test` / `*_demo`) |
| `npm run lint` / `npm run lint:fix` / `npm run format` | Biome |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run build` | build all workspaces |
| `npm run generate` | regenerate the Prisma client |
| `npm run migrate:dev` | create + apply a migration on the dev DB |
| `npm run test:db:migrate` | apply committed migrations to the test DB |
| `npm run studio` | Prisma Studio |

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build against a
Postgres service on every push and PR; on a PR a second job, `e2e`, runs
`npm run test:e2e` ([ADR-0037](decisions/0037-e2e-playwright.md)).

Database and migration conventions:
[`packages/core/prisma/README.md`](../packages/core/prisma/README.md).

## Testing

How a test finds an element, in the web tests and the Playwright specs alike:

- **By role, label or text** — `getByRole`, `getByLabel(Text)`, `getByText`, narrowed with
  `within` or a parent locator. When nothing names the element, give the component the
  name a screen-reader user would want too (a labelled list or region, a control named
  for its row) rather than a test hook.
- **`data-testid` only where nothing accessible exists** — a number in a KPI tile, a
  funnel or fact row, a timeline step. A state shown only by style is a `data-*`
  attribute that names it (`data-source`, `data-compact`).
- **Never by CSS class.** Classes belong to styling and can be renamed without a test
  noticing.

## Gotchas

- **`npm test` can pass while `core` does not build.** Vitest strips types without
  checking them; `npm run typecheck` is the one thing that typechecks `core`. Read a
  build's exit code, not its output files: `tsc` emits JS even when it fails.
- **`npm install -w <workspace> <pkg>` crashes** here (arborist, `reading 'location'`).
  Add the dependency to the workspace's `package.json`, then run `npm install` at the
  root.
- **A migration needs the `-w` form**: `npm run migrate:dev -w @job-search-copilot/core
  -- --name <name>`. Through the root script npm eats `--name`, and Prisma then waits
  on its prompt holding the advisory lock. More in
  [`packages/core/prisma/README.md`](../packages/core/prisma/README.md).
- **CSS is invisible to the web tests.** `index.css` never loads in jsdom, so layout,
  hover and placement need a browser (Playwright, `npm run test:e2e`).
- **MSW in the web tests:** a later `server.use()` wins, but inside one call the first
  handler wins; `passthrough()` sends the *real* request (to the dev API on :3000), it
  is not "try the next handler".
- **The MCP Inspector over HTTP:** `mcp-inspector --web --transport http --server-url
  http://localhost:3001/mcp`. Claude Desktop cannot reach `localhost` over HTTP (its
  connectors call from Anthropic's servers), so it stays on stdio until a deploy.
- **Better Auth logs an `ERROR` for every rejected API key**, and a "Base URL is not
  set" `WARN` once. Noise, not failures.
