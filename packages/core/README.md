# @job-search-copilot/core

The domain layer `apps/api` and `apps/mcp` share, and the only database client: the
Prisma schema and client, the services, the status rules, auth (Better Auth, API keys),
the domain errors. No `@nestjs/*`, no MCP SDK. The folders:
[`architecture.md` § Inside `packages/core/src`](../../docs/architecture.md#inside-packagescoresrc).
The database and migrations: [`prisma/README.md`](./prisma/README.md).

## Built, not read from source

`main` / `types` point at `dist/`: the apps run the compiled output. `npm run build`
emits it; in Docker the `core` service runs `npm run watch`. The apps' own watchers do
not see `dist/` change, so after a `core` edit restart them:
`docker compose restart core api mcp mcp-http`.
Why, and the alternatives: [ADR-0003](../../docs/decisions/0003-core-consumed-as-dist.md).
