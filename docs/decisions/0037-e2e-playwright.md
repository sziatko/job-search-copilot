# 0037 — End-to-end tests: Playwright on its own database, run on demand

- Status: Accepted · Date: 2026-10

## Context
The Vitest suite runs in Node: core and the API against the test DB, the web in jsdom
with MSW. jsdom has no layout and no CSS, so virtual rows, scrolling, the compact
topbar, the phone width, passkeys and the real session cookie are never exercised. A
browser suite is minutes, not seconds — too slow for the check every step runs.

## Decision
Playwright (Chromium) in a root `e2e/` folder, run by `npm run test:e2e`, never by
`npm test`. It starts its own API (:3100) and web (:5174) against
`job_search_copilot_e2e`, one worker. Global setup seeds the made-up data
(`resetToSeed`), signs a user in and copies every table into an `e2e_snapshot` schema;
each test starts from a restore of it.

A test signs in with a session cookie made in global setup — a user and a session
written through core, signed as Better Auth signs them — not through Google or
LinkedIn. The sign-in page itself is tested with a passkey on Chromium's virtual
authenticator.

Visual tests are part of it: `e2e/visual.spec.ts` takes `toHaveScreenshot` of every
page, dialog and empty state at a desktop and a phone viewport, light and dark, against
baselines committed beside it. They run only in the official Playwright Docker image —
`npm run test:visual` through docker compose locally, the `e2e` job in CI, the same tag
in both — never on the host. A visual run is a Playwright run of its own (`E2E_VISUAL=1`):
the seed is dated from a fixed "now" (`e2e/clock.ts`), the browser's clock is fixed
there and the api's clock starts there, so no date on a screenshot moves. Fonts are
self-hosted (`@fontsource`), and every run's seed starts its ids at 1.

It runs: the spec of the area being changed, when a covered feature is edited; the full
set before a push or a PR; a CI job on pull requests.

## Why this and not the alternatives
- **Cypress** — no multi-tab, no virtual WebAuthn authenticator; Playwright has both,
  headless in CI.
- **Inside `npm test`** — every step's check would start two servers and a browser.
- **Visual baselines taken on the host** — Windows, macOS and Linux render fonts
  differently; baselines from one fail on the others. One image renders them all.
- **The visual tests inside `npm run test:e2e`** — on the host they would compare
  against Linux baselines, and their pinned clock would move every other spec's dates.
- **The dev stack and the dev DB** — the dev DB holds real data the analyzer writes
  live; a reset would wipe it. Separate ports let both stacks run at once.
- **Signing in through the social providers** — captchas, 2FA, someone else's site.

## Consequences
- A real browser over the real API and DB covers what jsdom and MSW cannot see.
- A full run takes minutes; the first install downloads Chromium.
- The seed is also the future public demo's: changing it changes the demo, and moves
  the e2e counts (they come from `e2e/seed.ts`, derived from `SEED_VACANCIES`).
- A spec imports `test` / `expect` from `./fixtures`, never from `@playwright/test`.
- An intended look change updates its baselines in the same commit
  (`npm run test:visual:update`). The first visual run builds its image: minutes.

## What this constrains — breaks if you change it
- The restore and `emptyVacancies` wipe the tables and `resetToSeed` deletes one user's
  vacancies: they refuse a database whose name does not end in `_e2e` (`resetToSeed`:
  also `_test`, `_demo`). Removing the guard
  puts the dev DB one wrong `DATABASE_URL` away from being wiped.
- More than one worker → tests restore the shared DB under each other.
- The session cookie's name and signature follow Better Auth; an upgrade that changes
  either breaks e2e sign-in, and `apps/api/test/test-app.ts` with it.
- Seed data stays made-up (invariant 10): the demo will publish it.
- The Playwright image tag (`e2e/Dockerfile`, the `e2e` job in `ci.yml`) follows
  `@playwright/test`: a version bump changes all three, and retakes the baselines.
- The api's clock in a visual run is `e2e/shifted-clock.mjs`, a `Date` subclass: code
  that calls `Date()` without `new` throws under it.

## Related
[ADR-0015](0015-testing-strategy.md), [ADR-0034](0034-auth-better-auth-in-core.md),
`e2e/playwright.config.ts`, `e2e/db.ts`, `e2e/visual.spec.ts`.
