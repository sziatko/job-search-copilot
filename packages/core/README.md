# @job-search-copilot/core

Domain layer shared by `apps/api` (NestJS) and `apps/mcp` (MCP server): the Prisma
schema/client, `EstimatedVacancyService`, recommendation normalization, domain errors.

- Database & migration docs: [`prisma/README.md`](./prisma/README.md).
- Framework-agnostic on purpose — no `@nestjs/*`, no MCP SDK here.

## Build strategy (and a known rough edge)

`package.json` points `main`/`types` at `dist/`. The apps consume the **compiled
output**, not the `.ts` source:

- `npm run build` (tsc) emits `dist/`; `npm run watch` keeps it fresh.
- In Docker, the `core` service runs `npm run watch` so `api`/`mcp` see changes.

The rough edge: `api`'s `nest start --watch` and `mcp`'s `tsx` don't watch
`node_modules/@job-search-copilot/core/dist`, so after editing this package you may
need `docker compose restart api mcp` for the change to take effect.

**Open question (deferred):** whether to switch the apps to resolve
`@job-search-copilot/core` straight from `src/` via tsconfig `paths` + an swc/tsx
runner (removes the rebuild/restart step but means dropping `nest start --watch`),
or adopt TS project references (fixes cross-package typecheck staleness but not the
runtime rebuild). Revisit when the dev-loop friction actually starts to bite.
