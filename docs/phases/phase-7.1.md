# Phase 7.1: the public README — a showcase, `docs/development.md`, screenshots

## Goal

The repo goes public after this phase (then: rotate the old provider keys, run
`publish-guard.mjs --audit` over the whole history, flip the visibility). The root
`README.md` is not ready for that reader:

- **It is stale.** It names a `vacancy-match-analyzer` prompt and says nothing of the
  flow as it runs today: n8n intake with an API key, `NEW` rows, Claude scoring them
  over MCP, triage in the web, several users.
- **It mixes two readers.** A recruiter or a developer from LinkedIn wants to know in a
  minute what this is and how it works; the Docker gotchas, the private skills repo and
  `docker exec -e JSC_API_KEY` are for whoever runs it.
- **It has no pictures.** The mockups in `docs/design/` show where the UI started, not
  the app.

Decided with the user on 2026-10-14:

- **Two files.** `README.md` is the showcase; everything about running it moves to
  `docs/development.md`, almost unchanged.
- **Honest framing.** A personal tool, not a polished product: the analysis happens in
  Claude, the app keeps, tracks and shows; it keeps growing. What lives outside the repo
  (the n8n workflows, the user's skills) is said plainly. A roadmap from `backlog.md`.
- **Screenshots from a script**, on the made-up e2e seed (invariant 10), light and dark,
  so they are retaken with one command when the UI changes.
- **A short "How it's built"** section: the phase docs, a step per session, ADRs with
  their "what breaks" block, subagents for step chains, the invariants, `publish-guard`
  and the made-up seed.

## Steps

**1 · Screenshots.** `e2e/screenshots.ts`: a Playwright test that only shoots, no
assertions. It reuses the e2e set-up as it is — the `webServer`s, `global-setup.ts` (the
seed and the session), `fixtures.ts` (the snapshot restore). The theme is pinned through
`localStorage['jsc-theme']` (`apps/web/src/lib/theme.ts`) in `page.addInitScript`.
Screens: `/`, `/vacancies`, one vacancy (`/vacancies/$id`, a seed row with an analysis
and a status history), `/applications`, `/inbox`, each light and dark, viewport
1440×900 → `docs/screenshots/<screen>-<theme>.png`.
- A `screenshots` project in `e2e/playwright.config.ts` (`testMatch: 'screenshots.ts'`),
  added to `projects` only when `process.env.npm_lifecycle_event === 'screenshots'`, so
  `npm run test:e2e` and CI never see it. Root script:
  `"screenshots": "playwright test -c e2e --project screenshots"`.
- Check: `npm run screenshots` writes 10 PNGs; look at each (made-up companies only);
  `npm run test:e2e -- smoke` still passes and writes none.

**2 · README, `docs/development.md`, close-out.**
- `docs/development.md` ← the running part of today's README: Getting started, the
  owner's fresh clone, the services table, `mcp` / `mcp-http`, API keys
  (`JSC_API_KEY`, `docker exec -e`), the containers' `node_modules` note, Scripts, CI.
  Drop the stale "— from phase 6.3 step N" notes; add `npm run screenshots`.
- `README.md`, in English, ~120–160 lines: what it is (one paragraph, the framing
  above); the dashboard screenshot in a `<picture>` (`prefers-color-scheme` picks dark or
  light), then the others; how it works (n8n → `POST /vacancies/intake` with a key →
  `NEW` → Claude scores over MCP → triage in the web → status tracking; the two axes,
  `recommendation` and `status`); features; architecture (the packages table, the
  stack, a link to `docs/architecture.md`); a short quick start linking to
  `docs/development.md`; How it's built; roadmap; license.
- Links: a `docs/README.md` row for `development.md`, and its "how to run it" pointer
  moved there; `CLAUDE.md`'s `README.md § Scripts` link → `docs/development.md`.
- The backlog's Screenshots row → `backlog-archive.md`.
- Check: every relative link in both files resolves; the screenshots render in GitHub's
  preview on the branch; `publish-guard` on the diff; `npm run lint`; the full
  `npm test`. Then the PR.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`, the backlog's Screenshots
  row `planned (phase 7.1)`. — *2026-10-14.*
- [ ] **1 · Screenshots.**
- [ ] **2 · README, `docs/development.md`, close-out.**
