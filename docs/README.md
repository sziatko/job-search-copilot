# Design docs

Why the code is shaped this way, and what a change here breaks elsewhere. How to run
it: [`development.md`](development.md).

| Doc | What's in it |
| --- | --- |
| [`architecture.md`](architecture.md) | The system map: the four packages, the request paths, the dev stack, the invariants. Start here. |
| [`domain-model.md`](domain-model.md) | The terms, `Vacancy`, its two independent fields (`recommendation`, `status`), the status journal, the DB rules. |
| [`contracts.md`](contracts.md) | The surfaces other code depends on: the REST API, the MCP tools, the web↔API schema. |
| [`development.md`](development.md) | Running it locally: the Docker stack, the databases, the MCP server, API keys, scripts, gotchas. |
| [`decisions/`](decisions/) | One ADR per decision other code depends on. |
| [`backlog.md`](backlog.md) | Ideas and fixes not yet planned. |
| [`design/`](design/) | The HTML mockups the UI started from. Open them in a browser. |

## Conventions

- **These docs describe the code as it is now.** No history: git keeps it. When the
  code changes, the doc changes in the same commit.
- **ADRs are numbered** (`0001`, …), never renumbered, a number never reused. A
  replaced ADR is deleted; the new one's `Replaces:` line names it, and the index lists
  the gap.
- **"What this constrains — breaks if you change it"** ends every ADR, and the
  sections of the overview docs where a boundary is at stake. It names real files:
  read it before touching the area.
- **A phase's plan** (`docs/phases/phase-N.md`) is a working file for the agent: not
  committed, deleted when the phase ends. What it defers goes to the backlog.

## Secrets

- **Credentials live in untracked files.** The apps read env vars loaded at boot
  ([ADR-0007](decisions/0007-env-config-and-loading.md)); the values sit in `.env`,
  `.env.test` and `.env.e2e`, which `.gitignore` covers. Only their `*.example`
  templates, with fake values, are tracked.
- **If a key reaches a commit, rotate it first.** Rewriting history cleans up but does
  not help: the key has already been through clones, backups and caches.
