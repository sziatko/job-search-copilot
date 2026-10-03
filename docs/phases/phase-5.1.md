# Phase 5.1: API docs — Swagger UI for REST, the MCP Inspector for MCP

## Goal

A way to *see and try* both surfaces without reading the code. No migration, no
change to core, the web app or the skills.

- **REST:** Swagger UI at `/api/docs` (raw document at `/api/docs-json`), built from
  what already exists — the DTOs' `class-validator` decorators and the controllers'
  JSDoc. No `@Api*` decorators.
- **MCP:** the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) — a
  web UI that lists the tools with their schemas and descriptions and calls them.
  MCP runs over stdio, so there is no URL to serve; the tools already describe
  themselves through `tools/list`, and the Inspector is the viewer.

Decided with the user on 2026-10-03:

- **Request docs only.** Responses stay untyped in the document (controllers return
  `core` plain objects, not classes); `@ApiOkResponse({ type })` is a later, per-endpoint
  addition if one is wanted.
- **The Inspector is enough** for MCP — no generated `mcp-tools.md` (it would be a
  second copy of the tool descriptions, to keep in step).
- **Swagger UI**, not Scalar: it ships inside `@nestjs/swagger`, so no second package.

Out of scope: generating the web client from the document. [ADR-0012](../decisions/0012-web-hand-written-contract.md)
rejected that when no OpenAPI document existed; now one does, but invariant 5 (the web's
contract is a hand-written zod schema) stands until someone decides otherwise.

## How it works, and the one trap

`@nestjs/swagger` 12 (peer `@nestjs/core ^12`) with its **CLI plugin**: a TypeScript
transformer that, at *build* time, reads each `*.dto.ts` and `*.controller.ts` and adds
the schema metadata (`classValidatorShim` turns `@Min`, `@IsIn`, `@ArrayMaxSize`… into
schema constraints; `introspectComments` turns the JSDoc into descriptions).

The trap: the plugin runs in `nest build` / `nest start --watch` (tsc), **not** under
vitest, which transforms with SWC (`apps/api/vitest.config.mts`). So under test the
document has the paths but not the DTO properties. The test asserts the paths only; the
properties are checked by eye in the browser, once. Making SWC emit the metadata needs
`PluginMetadataGenerator` and a generated file — not worth it for a docs page.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`. — *2026-10-03.* Docs only.

- [x] **1 · REST: Swagger UI.** — *2026-10-03.* `npm test` 482/482, lint and typecheck
  clean. Checked on a real `nest build` + boot (port 3999): the plugin is on —
  `maxItems: 100` and the field comments are in the document; an endpoint's JSDoc lands
  in `summary` (the plugin puts all of it there, `description` stays empty). **Not seen
  in a browser**: `/api/docs` answers 200, the look is untested. The Docker `api`
  container has not been rebuilt: `docker compose up -d --build api` (new dependency)
  before opening `/api/docs` there. Side effect of the install, in `package-lock.json`:
  swagger's peer range (`typescript ^5.5 || ^6`) made npm drop the hoisted
  `typescript` 7.0.2 and its `@typescript/typescript-*` binaries for one 6.0.3 at the
  root (the workspaces all ask `^6.0.3`) — the lockfile diff is ~570 lines, not 1 package.
  - `npm i @nestjs/swagger -w @job-search-copilot/api` (12.x, the latest).
  - `apps/api/nest-cli.json`: the `@nestjs/swagger` plugin under
    `compilerOptions.plugins`, options `{ "introspectComments": true }` (the
    class-validator shim is on by default; the file-name suffixes default to
    `.dto.ts` / `.controller.ts`, which is what the repo uses).
  - `configureApp` in `apps/api/src/setup-app.ts`, after the prefix and versioning
    lines: `SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Job
    Search Copilot API').setVersion('1').build())`, then `SwaggerModule.setup('docs',
    app, document, { useGlobalPrefix: true })`. In `configureApp`, not `main.ts`, so
    the e2e suite builds the same document (the function's own stated purpose).
  - Test: `apps/api/test/docs.e2e.spec.ts` — `GET /api/docs-json` → 200, and its
    `paths` has `/api/v1/vacancies/intake` and `/api/v1/vacancies/{id}/analysis`
    (check the exact keys against the real document: the prefix and the URI version
    both end up in them, or neither does). Not the properties — see the trap above.
  - By eye, once, with the stack up: `/api/docs` opens; `POST /vacancies/intake` shows
    the body fields and `maxItems: 100`, and its summary is the JSDoc; "Try it
    out" on `GET /vacancies?limit=1` returns a row. Docker: the new dependency has to
    reach the `api` container (per-service `node_modules` — `docker compose up -d
    --build api`, then `restart`), and `nest start --watch` rebuilds with tsc, so the
    plugin is on there.
  - ADR-0012: one line under Consequences — an OpenAPI document exists since phase
    5.1 (`/api/docs-json`) but the web still does not generate from it.
  - `docs/contracts.md` (a line on where the REST docs are), root `README.md` § Scripts
    or Running (the URL).
  - There is no auth, and the docs page has none either; fine while the stack is local
    (the auth backlog row must also cover `/api/docs` before anything goes to the cloud).

- [x] **2 · MCP: the Inspector.** Independent of step 1. — *2026-10-03.* `npm test`
  482/482, lint and typecheck clean. Checked through the Inspector's own `--cli` mode
  (`mcp-inspector --cli npm run dev:mcp --method tools/list`): all 13 tools listed with
  their descriptions, `tools/call list_vacancies limit=1` returned a row. The web UI
  boots (`http://127.0.0.1:6274`, prints a token URL) but its look is **not seen in a
  browser**. Gotchas: the script is `mcp-inspector npm run dev:mcp` — a devDependency
  (`@modelcontextprotocol/inspector` 2.9), not `npx`; it must go through the *root*
  `dev:mcp`, because the Inspector parses `-w` itself and `npm run dev -w …` fails with
  "Missing script". npm blocked two postinstalls (`@scarf/scarf` telemetry, the
  Inspector's `install-clients`, a no-op outside its own checkout) — left blocked, it
  runs fine. The install adds ~1400 lines to `package-lock.json` and `npm audit` now
  reports 9 vulnerabilities (2 moderate, 7 high) — not looked into, dev-only tooling.

## Verification, every step

`npm run lint`, `npm run typecheck`, the full `npm test` (the real test DB, invariant 7).
