---
name: chain-steps
description: Run several planned steps of a phase in one go, each in a fresh subagent, with the main session verifying and committing. Use when the user says "виконуй кроки N–M ланцюжком", "run steps N–M as a chain", or asks to chain phase steps.
---

# Chaining phase steps

The main session only coordinates: it never does a step itself and never reads the
docs a step needs — the subagent does, in its own context. That is the point: the main
context stays small (phase 4: ~32M tokens chained vs ~169M for 3.1 step by step).

CLAUDE.md § Phase workflow still holds for every step; this is what changes in a chain.
E2E (`npm run test:e2e`) is not part of a step's checks, neither the subagent's nor the
verification below — except the spec a step itself writes or changes (ADR-0037). The
full e2e set runs once, before the push or PR.

## Per step K

**A. Subagent** — a fresh `general-purpose` agent (never `fork`: it copies this context,
the thing a chain avoids), in the foreground unless the user is busy answering about the
previous step. Same brief every time, only the phase doc and K change:

> You are doing ONE step of a planned phase in this repo. Read `CLAUDE.md`, then
> `docs/phases/phase-N.md`; do step **K** only — the plan is the agreement, it needs no
> second review. Reuse what earlier steps' checkbox notes name. Read the docs/ADRs/code
> the step touches first. Write the step's tests with it. Run only the touched projects
> (`npm test -- --project core|api|mcp|web`; a core edit also touches api and mcp —
> build core first: `npm run build --workspace=@job-search-copilot/core`), plus
> `npm run lint` and `npm run typecheck`. Do NOT `git commit`, do NOT migrate the dev DB.
> When done: tick step K's checkbox in `## Status` with today's date; if you diverged
> from the plan, edit that part of the plan; beside the checkbox add only what the next
> step must know and the code cannot show. If the plan cannot answer a question — STOP
> and return the question; do not guess.
> Return ≤ 250 words: files changed, test/lint/typecheck results, divergences, open questions.

Add to the brief when it applies:
- The step after a core change checks the UI → the main session runs
  `docker compose restart api mcp` first, so the running stack serves the new core.
- Playwright MCP writes only inside the repo → save screenshots to `.playwright-mcp/`;
  the main session moves them to its scratchpad and deletes the folder before committing.

**B. Verify yourself** — without reading the whole diff (that is what bloats the context):
- the subagent's report; `git status` + `git diff --stat`; step K's checkbox is ticked;
- `npm run lint`, `npm run typecheck`, the **full** `npm test`, output cut to the
  summary (`| tail`).

**C. Green → commit without asking** — the user's chain request is the approval.
Message `Phase N.K: <what changed, in words>`, ending with the Co-Authored-By line.
Stage the step's files only — the phase doc stays out of every commit.
Push and PR only when asked.

## When the chain stops

- Red tests. Exception: a known load flake (`apps/web` `useVacancies.test.ts` timeouts,
  api e2e timeouts) gets one rerun of the failed project; green →
  go on and name the flake in the report; red again → stop.
- The subagent returned a question the plan cannot answer.
- The subagent diverged from the plan in a way that changes later steps.
- A dev-DB migration is needed — it waits for the user's go-ahead (the analyzer writes
  to the dev DB live; back it up with `pg_dump` first, then
  `docker compose restart core api mcp mcp-http`).

At a stop: commit nothing for that step, say what happened, wait. A stopped subagent
(a question, a rate limit) is resumed with `SendMessage` — not restarted, it keeps its
context. The next step may run in the background while the user answers.

## The report

One report at the end: per step — what was done, test results, stops and why,
divergences from the plan, flakes. Then cost, from the transcripts:
`~/.claude/projects/<project>/<session>.jsonl` for the main session,
`<session>/subagents/agent-*.jsonl` for each step. Per file, sum `message.usage`
(`input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens`)
over assistant messages **deduplicated by `message.id`**; also report the call count and
the largest single-call context. A small node script in the scratchpad does it.
