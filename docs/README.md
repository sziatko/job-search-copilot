# Design docs

The **why** behind this codebase. The root [`README.md`](../README.md) and the
package READMEs cover *how to run it*; these cover *why it's shaped the way it is*
and *what a change here breaks over there*.

## Read first

| Doc | What's in it |
| --- | --- |
| [`architecture.md`](architecture.md) | The system map: the four packages, their boundaries, the request lifecycle, the dev stack. Start here. |
| [`domain-model.md`](domain-model.md) | `EstimatedVacancy`, the two independent axes (analyzer `recommendation` vs the user's `userAction`), the state flow, analyze-once, the DB-level rules. |
| [`contracts.md`](contracts.md) | The external-facing surfaces other code depends on: the REST API, the nine MCP tools, the web↔API schema contract. Each notes who breaks if it changes. |
| [`decisions/`](decisions/) | One Architecture Decision Record (ADR) per load-bearing choice — context, the decision, why not the alternatives, and what it constrains. |
| [`phases/phase-1.md`](phases/phase-1.md) | What Phase 1 delivered, its status, and everything deliberately deferred. |
| [`phases/phase-2.md`](phases/phase-2.md) | Application tracking: the `Application` model, the `/tracker` page, the router, the one-off `tracker.md` import, and the post-phase work that reworked all of it (2026-09-14 → 09-21). |
| [`phases/phase-2.1.md`](phases/phase-2.1.md) | Follow-up work on the vacancies table: server-side search, the duplicate-company button and modal, and row actions as buttons. Planned before implementing; its `## Status` is the live checklist. |
| [`phases/phase-2.2.md`](phases/phase-2.2.md) | The 15 findings of a review over phase 2.1's diff: LIKE wildcards in user input, a list the app truncates and reports wrongly, false claims on failure. Planned before implementing; its `## Status` is the live checklist. |
| [`design/`](design/) | The HTML mockup the web UI was built against, and what it does *not* decide. An artifact rather than prose — open it in a browser, not in an editor. |

## Conventions

- **ADRs are numbered globally** (`0001`, `0002`, …) and never renumbered. Each is
  tagged with the `Phase:` it was decided in. A superseded ADR keeps its file and
  its `Status:` line points at the replacement.
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
1. Write `docs/phases/phase-N.md` from the phase plan *before* implementing.
2. Add one ADR per load-bearing decision, continuing the numbering, tagged
   `Phase: N`. Copy the template from [`decisions/README.md`](decisions/README.md).
3. If a Phase-N decision replaces an earlier one, set the old ADR's `Status:` to
   `Superseded by NNNN` and link both ways.
4. Update [`architecture.md`](architecture.md) / [`domain-model.md`](domain-model.md) /
   [`contracts.md`](contracts.md) if the change moves a boundary or a contract.
