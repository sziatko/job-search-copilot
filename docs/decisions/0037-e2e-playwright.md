# 0037 — End-to-end tests: Playwright on its own database, run on demand

- Status: Accepted
- Phase: 6.3   ·   Date: 2026-10

## Context
Every test so far runs in Node: core and api against the test DB, web in jsdom with MSW.
jsdom has no layout, so virtual rows, scrolling, the compact topbar, the phone width,
passkeys and the real session cookie are never exercised. A browser suite is slow next
to Vitest, and the steps of a phase are verified with the full `npm test` before each
commit — adding a browser to that loop would cost every step minutes.

## Decision
Playwright (Chromium only) in a root `e2e/` folder, run by `npm run test:e2e`, never by
`npm test`. It starts its own api (:3100) and web (:5174) against
`job_search_copilot_e2e`, reset to the made-up seed (`resetToSeed` in core) before each
test, one worker. A test signs in by a session cookie made in global setup — a user and
a session through core's `createAuth`, signed as Better Auth signs it — not through
Google or LinkedIn; the sign-in page itself is tested with a passkey on a virtual
authenticator. It runs: the spec of the area being changed when a covered feature is
edited; the full set before a push or PR; a CI job on pull requests.

## Why this and not the alternatives
- **Cypress** — one browser tab at a time, no multi-tab, no native WebAuthn virtual
  authenticator; Playwright has both and runs headless in CI with one install command.
- **e2e inside `npm test`** — every step's check would start two servers and a browser.
- **The dev stack and dev DB** — the dev DB holds real data the analyzer writes live;
  a reset would wipe it. Separate ports let both stacks run at once.
- **Signing in through the social providers** — captchas, 2FA, someone else's site.

## Consequences
- A real browser over the real API and DB: what jsdom and MSW cannot see is covered.
- A full run takes minutes, not seconds, and the first install downloads Chromium.
- The seed is shared with the public demo (backlog), so changing it changes the demo.

## What this constrains — breaks if you change it
- `resetToSeed` deletes every vacancy: it refuses a database whose name does not end in
  `_e2e`, `_test` or `_demo`. Removing the guard puts the dev DB one wrong
  `DATABASE_URL` away from being wiped.
- More than one worker makes tests reset the shared DB under each other.
- The session cookie's name and signature follow Better Auth; a Better Auth upgrade that
  changes either breaks e2e sign-in (and `apps/api/test/test-app.ts` with it).
- Seed data must stay made-up (invariant 10): the demo will publish it.

## Related
[ADR-0015](0015-testing-strategy.md),
[ADR-0034](0034-auth-better-auth-in-core.md), [`../phases/phase-6.3.md`](../phases/phase-6.3.md).
