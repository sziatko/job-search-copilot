# Design docs

The **why** behind this codebase. The root [`README.md`](../README.md) and the
package READMEs cover *how to run it*; these cover *why it's shaped the way it is*
and *what a change here breaks over there*.

## Read first

| Doc | What's in it |
| --- | --- |
| [`architecture.md`](architecture.md) | The system map: the four packages, their boundaries, the request lifecycle, the dev stack. Start here. |
| [`domain-model.md`](domain-model.md) | `EstimatedVacancy`, the two independent axes (analyzer `recommendation` vs the user's `userAction`), the state flow, analyze-once, the DB-level rules. |
| [`contracts.md`](contracts.md) | The external-facing surfaces other code depends on: the REST API, the four MCP tools, the web↔API schema contract. Each notes who breaks if it changes. |
| [`decisions/`](decisions/) | One Architecture Decision Record (ADR) per load-bearing choice — context, the decision, why not the alternatives, and what it constrains. |
| [`phases/phase-1.md`](phases/phase-1.md) | What Phase 1 delivered, its status, and everything deliberately deferred. |

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
