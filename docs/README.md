# Design docs

The **why** behind this codebase. The root [`README.md`](../README.md) and the
package READMEs cover *how to run it*; these cover *why it's shaped the way it is*
and *what a change here breaks over there*.

## Read first

| Doc | What's in it |
| --- | --- |
| [`architecture.md`](architecture.md) | The system map: the four packages, their boundaries, the request lifecycle, the dev stack. Start here. |
| [`domain-model.md`](domain-model.md) | `Vacancy`, the two independent axes (analyzer `recommendation` vs the user's `status`), the `StatusChange` journal, the status lifecycle, analyze-once, the DB-level rules. |
| [`contracts.md`](contracts.md) | The external-facing surfaces other code depends on: the REST API, the thirteen MCP tools, the web↔API schema contract. Each notes who breaks if it changes. |
| [`decisions/`](decisions/) | One Architecture Decision Record (ADR) per load-bearing choice — context, the decision, why not the alternatives, and what it constrains. |
| [`backlog.md`](backlog.md) | What is not yet planned into a phase, in two lists: ideas (new capabilities) and improvements / fixes. Only open and planned rows; done and not-relevant ones move to [`backlog-archive.md`](backlog-archive.md). |
| [`phases/phase-1.md`](phases/phase-1.md) | What Phase 1 delivered and its status. |
| [`phases/phase-2.md`](phases/phase-2.md) | Application tracking: the `Application` model, the `/applications` page, the router, the one-off `tracker.md` import, and the post-phase work that reworked all of it (2026-09-14 → 09-21). |
| [`phases/phase-2.1.md`](phases/phase-2.1.md) | Follow-up work on the vacancies table: server-side search, the duplicate-company button and modal, and row actions as buttons. Planned before implementing; its `## Status` is the live checklist. |
| [`phases/phase-2.2.md`](phases/phase-2.2.md) | The 15 findings of a review over phase 2.1's diff: LIKE wildcards in user input, a list the app truncates and reports wrongly, false claims on failure. Planned before implementing; its `## Status` is the live checklist. |
| [`phases/phase-3.md`](phases/phase-3.md) | The vacancy log in the DB (check-and-record over MCP and REST, the one-off import, the LinkedIn URL rule), application comments as a table, and editing an application on `/applications`. Its `## Status` is the live checklist. |
| [`phases/phase-3.1.md`](phases/phase-3.1.md) | One `Vacancy` table: `Application` merged in, one status enum with a `StatusChange` journal, every comment in one table with a `source`, one apply/edit modal, the renames, and a dead-code sweep. Its `## Status` is the live checklist. |
| [`phases/phase-4.md`](phases/phase-4.md) | Web: infinite scroll on every table (Prisma cursor paging), the `/log` page, the dashboard counted from the journal through `GET /stats`, and a page for one vacancy. Its `## Status` is the live checklist. |
| [`phases/phase-4.1.md`](phases/phase-4.1.md) | Fixes after phase 4: the dashboard funnel from Recommended with a "Dropped out" block and its styles, the table count in the toolbar with full-height tables, a two-state theme toggle, the CV tick. Its `## Status` is the live checklist. |
| [`phases/phase-4.2.md`](phases/phase-4.2.md) | Fixes after phase 4.1: a header and KPI tiles that collapse on scroll, no sideways scroll on a phone, themed scrollbars, the company-history modal (a status column, row actions, on `/applications` too), no repeated triage status, and a new `UNAVAILABLE` status. Its `## Status` is the live checklist. |
| [`phases/phase-4.3.md`](phases/phase-4.3.md) | Fixes after phase 4.2: skeletons in place of every "Loading…", the company-history modal (a CV column, Details in a new tab, the current row scrolled into view), the salary label, a toaster that follows the theme toggle, a toast after every write, a review card as tall as the funnel, and one company whatever its spelling (ADR-0032). Its `## Status` is the live checklist. |
| [`phases/phase-5.md`](phases/phase-5.md) | Unscored vacancies in one table: the vacancy log merged into `Vacancy`, the `NEW` / `FILTERED_OUT` statuses, an intake endpoint for n8n, analysis pulled and submitted over MCP, an `/inbox` page, per-page status contexts, search in a modal, and the `salaryInApplication` rename. Its `## Status` is the live checklist. |
| [`design/`](design/) | The HTML mockup the web UI was built against, and what it does *not* decide. An artifact rather than prose — open it in a browser, not in an editor. |

## Conventions

- **ADRs are numbered globally** (`0001`, `0002`, …), never renumbered, and a number is
  never reused. Each is tagged with the `Phase:` it was decided in.
- **A replaced ADR is deleted**, so it stops costing context. The new ADR's `Replaces:`
  line names it, and git keeps it (`git log --all -- 'docs/decisions/NNNN-*'`). The
  index lists the gap in one line.
- Every ADR ends with a **"What this constrains — breaks if you change it"**
  block; the overview docs carry the same block on the sections where a boundary
  or contract is actually at stake (not on every section). That block names real
  files and behaviours: it's the spec-driven part — read it before touching the
  area.
- A claim that couldn't be verified from the code alone (rationale that lived only
  in a chat transcript) is flagged inline as `> inferred from code — confirm`.

## Secrets

- **Credentials live in untracked files, never in tracked ones.** The apps read config
  from env vars loaded at boot ([ADR-0007](decisions/0007-env-config-and-loading.md));
  the values sit in `.env` / `.env.test`, which `.gitignore` covers — only
  `.env.example` is tracked. Claude Code's own credentials sit in
  `~/.claude/keys/<profile>.key` — outside the repository working tree entirely, not
  merely gitignored. `.claude/settings.json` carries no credential — only an
  `apiKeyHelper` that prints the selected one (`~/.claude/get-key.mjs`, profile named in
  `~/.claude/profiles.json`). Switch providers with
  `claude-profile <deepseek|glm|claude|omniroute>`, which rewrites `env` and
  `apiKeyHelper` in the current project's settings; `claude` means no custom endpoint at
  all. The file stays gitignored because the helper path is machine-specific, not because
  it holds a secret.
- **If a key does reach a commit, rotating it is the fix.** Rewriting history is the
  cleanup, not the remedy: by the time you notice, the key has been through clones,
  backups, and whatever the host caches. Do both, and rotate first.

## Reviewing & extending these docs

**To review** (e.g. from the chat that did the implementation): run
`grep -rn "inferred from code" docs/` for the open items, correct anything wrong in
place, and delete the flag once confirmed. Corrections are edits to the existing
file — no new doc, no changelog.

**To add the next phase:**
1. Write `docs/phases/phase-N.md` from the phase plan *before* implementing. Items it
   takes from [`backlog.md`](backlog.md) are marked `planned (phase N)` there; what the
   phase defers, or a new idea found on the way, goes into the backlog, not into a
   "Deferred" section of the phase doc. When the phase finishes an item, its row moves
   to [`backlog-archive.md`](backlog-archive.md).
2. Add one ADR per load-bearing decision, continuing the numbering, tagged
   `Phase: N`. Copy the template from [`decisions/README.md`](decisions/README.md).
3. If a Phase-N decision replaces an earlier one, add `Replaces: NNNN` to the new ADR,
   delete the old file in the step that removes its code, and fix the links to it.
4. Update [`architecture.md`](architecture.md) / [`domain-model.md`](domain-model.md) /
   [`contracts.md`](contracts.md) if the change moves a boundary or a contract.
