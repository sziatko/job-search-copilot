# Design docs

Why the code is shaped this way, and what a change here breaks elsewhere. How to run
it: [`development.md`](development.md).

| Doc | What's in it |
| --- | --- |
| [`architecture.md`](architecture.md) | The system map: the four packages, the request paths, the dev stack, the invariants. Start here. |
| [`domain-model.md`](domain-model.md) | The [glossary](domain-model.md#glossary), `Vacancy`, its two independent fields (`recommendation`, `status`), the status journal, the DB rules. |
| [`contracts.md`](contracts.md) | The surfaces other code depends on: the REST API, the MCP tools, the web↔API schema. |
| [`development.md`](development.md) | Running it locally: the Docker stack, the databases, the MCP server, API keys, scripts, gotchas. |
| [`deployment.md`](deployment.md) | The server: its layout, the first start, deploying a version, rolling back. |
| [`decisions/`](decisions/) | One ADR per decision other code depends on. |
| [`backlog.md`](backlog.md) | Ideas and fixes not yet planned. |
| [`design/`](design/) | The HTML mockups the UI started from. Open them in a browser. |

## Conventions

- **How to write them** — as the code is now, one fact in one place, no history:
  [Writing docs and comments](#writing-docs-and-comments) below.
- **ADRs are numbered** (`0001`, …), never renumbered, a number never reused. A
  replaced ADR is deleted; the new one's `Replaces:` line names it, and the index lists
  the gap.
- **"What this constrains — breaks if you change it"** ends every ADR, and the
  sections of the overview docs where a boundary is at stake. It names real files:
  read it before touching the area.
- **A phase's plan** (`docs/phases/`) is the agent's working file, gitignored, not part
  of these docs.

### Writing docs and comments

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
  with and without the slash", not names or row counts
  ([invariant 10](architecture.md#system-invariants)).
- **A comment says *why*, for the spot it sits on.** A deliberate shortcut with a known
  ceiling is a plain `Limit: … Past that: …` comment, never a `ponytail:` tag — that
  plugin convention does not apply in this repo.
- **One sentence per table cell.** More is a section of its own.
- **Code that deletes data checks its target first** (the database name), as
  `vitest.test-db.ts`, `resetToSeed` and `e2e/db.ts` do; never trust an env fallback.
- **When code changes, its docs change in the same commit.** Grep the old name across
  `docs/`, comments and tests before calling a rename done.

## Secrets

- **Credentials live in untracked files.** The apps read env vars loaded at boot
  ([ADR-0007](decisions/0007-env-config-and-loading.md)); the values sit in `.env`,
  `.env.test` and `.env.e2e`, which `.gitignore` covers. Only their `*.example`
  templates, with fake values, are tracked.
- **If a key reaches a commit, rotate it first.** Rewriting history cleans up but does
  not help: the key has already been through clones, backups and caches.
