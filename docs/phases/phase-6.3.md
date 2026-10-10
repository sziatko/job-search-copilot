# Phase 6.3: tests — the web↔API contract, a made-up seed, Playwright over every feature

## Goal

531 tests today: core (integration, real DB), api e2e (supertest), mcp, web (vitest +
jsdom + MSW). Two gaps.

- **Nothing checks the web↔API contract.** The web's zod schemas are hand-written
  (invariant 5) and the MSW handlers serve what the tests made up. An API field renamed
  leaves every test green and a page broken.
- **Nothing runs in a real browser.** jsdom has no layout: virtual rows, scrolling, the
  compact topbar, the phone width, passkeys and the real session cookie are untested.

So: a contract test, a seed of made-up data (the public demo will reuse it, see
`backlog.md`), and Playwright over **every** screen and action — one test per main
path; edge cases stay in the unit and integration layers.

Decided with the user on 2026-10-10:

- **When e2e runs.** Not in `npm test`, not in each step's checks. The spec of the area
  being changed, when a covered feature is edited; the full set before a push or PR, and
  in a CI job on pull requests. [ADR-0037](../decisions/0037-e2e-playwright.md).
- **Made-up data only**, company names included (invariant 10).
- **The flaky full `npm test`** is fixed first (step 1): e2e adds load to the machine.

## Steps

**1 · The flaky full `npm test`.** The api e2e `beforeAll` timeout under load (its
backlog row). Find the cause; raise a timeout only if no cause is found, and say so.

**2 · The web↔API contract test.** `apps/api/test/contract.e2e.spec.ts`; an `@` →
`apps/web/src` alias in `apps/api`'s vitest config, so the web's schemas are imported
as they are. Data the existing way (`VacancyIntakeService`, `POST /vacancies`,
`POST /applications`, `signedInAgent` from `test/test-app.ts`). Every response the web
parses goes through its schema (`apps/web/src/pages/*/types.ts`):
`vacancyPageSchema` (`GET /vacancies` with `status`, `search`, `sameCompanyAs`,
`hasText`), `vacancyDetailSchema`, `vacancyListItemSchema` (`PATCH /vacancies/:id/status`),
`applicationPageSchema` (with `state=active|timedOut`), `recordApplicationResponseSchema`,
`applicationListItemSchema` (both `PATCH`es on `/applications/:id`), `statsSchema`.
The nullable shapes are covered: a vacancy with no analysis, one with no text, a full
one. The test stays out of `apps/api/tsconfig.build.json`, and the typecheck does not
pull web's DOM files into api. Proven once by breaking a schema locally (not committed).

**3 · The seed.** `packages/core/src/seed/`: the data, and `resetToSeed(prisma)` — an
idempotent "make the DB the seed". It refuses unless the database name in
`DATABASE_URL` ends in `_e2e`, `_test` or `_demo`: it deletes every vacancy, and the
dev DB holds real data. About 150 vacancies, so a list runs past one page of 100:
every status (`NEW` with and without text, `FILTERED_OUT` with and without an analysis,
`NOT_REVIEWED` with APPLY / CONSIDER / SKIP, `SAVED_FOR_LATER`, `DECLINED`,
`UNAVAILABLE`), the pipeline `APPLIED … REJECTED` with `AWAITING`, timed-out
applications (over 30 days), companies with several vacancies, ANALYZER / USER / AGENT
comments, a status journal. Dates relative to now, so the timeout is deterministic;
statuses through the services so `StatusChange` rows exist, dates adjusted afterwards
with Prisma. `npm run seed` against `.env.e2e`. Tests (core): two runs leave the same
counts; a database name without the suffix is refused.

**4 · Playwright scaffold.** A root `e2e/` folder: `playwright.config.ts`,
`tsconfig.json`, `global-setup.ts`, `fixtures.ts`, `.env.e2e` (fake values, as
`.env.test`). `@playwright/test` in the root devDependencies, Chromium only.
`webServer`: the api on :3100 (the e2e DB, `WEB_ORIGIN=http://localhost:5174`) and vite
on :5174 (`VITE_API_URL=http://localhost:3100`) — not the dev stack's 3000 / 5173, so
both run at once. Global setup: create `job_search_copilot_e2e` if missing,
`prisma migrate deploy`; an allowlisted user and a session through core's `createAuth`,
the cookie signed as `signIn()` in `apps/api/test/test-app.ts` does → `storageState`.
A fixture runs `resetToSeed` before each test; `workers: 1` (one DB). `npm run
test:e2e`; lint and typecheck cover `e2e/`; `.gitignore` gets `test-results/` and
`playwright-report/`. First spec (smoke): the dashboard shows the seed's numbers; with
no cookie the browser lands on `/login`.

**5 · Shell and dashboard.** Each sidebar link → its h1; Collapse / Expand and the
per-route default; the theme toggle survives a reload; the compact topbar on scroll;
390px: Open / Close navigation, the title on one line; the search modal (a term, All /
Context, Hide Filtered out, open details); Sign out → `/login`, and a guarded route
then sends there too; a 401 mid-session (the session deleted in the DB, then an
action) → `/login`. Dashboard: the tiles, the funnel, "Needs your review" with its
Review links, the Recent activity links.

**6 · Vacancies and Inbox.** The Status select and `?status=`; infinite scroll past
100 rows, and the scroll reset on a filter change. Actions: Save for later with a
comment (the comment shows on the vacancy page), Decline (Cancel / "Yes, decline"),
Mark unavailable, Mark not reviewed, the Apply dialog (the vacancy shows in
/applications), Copy (clipboard permission). The company-history modal ("Current",
open details). Inbox: the three tabs and `?tab=`, Filter out, Back to queue, the empty
states.

**7 · The vacancy page.** The header, "Not analysed yet"; the status select — a plain
move, Save for later with a comment, Decline, Apply; the pipeline select of an
application. Show full description / Show less; Add comment, and the Status history
timeline updates. Other vacancies; "Vacancy not found" for an unknown id; Back.
A small a11y fix with it: `aria-label="Status"` on the two unnamed status selects (here
and on /applications rows); web unit tests follow if they found them by role.

**8 · Applications.** The tiles as a filter (`aria-pressed`, `?status=`); the select
with Active, Timeout, Awaiting. A move through the pipeline to `AWAITING`, then
`OFFER`, and the dashboard's counts follow. The Edit dialog (salary, CV, comment →
"Application updated"); the merged comment's Show more.

**9 · Sign-in, passkeys, consent.** `/login?error=…` shows the alert. Google and
LinkedIn: only that the request heads for the provider (`page.route`, no real Google).
Passkeys with a virtual WebAuthn authenticator (CDP): add one on /profile, see it
listed, Sign out, "Sign in with a passkey", Remove. Consent: an OAuth client created in
the DB, the authorize URL opened; Allow lands on the `redirect_uri` with a `code`; Deny.

**10 · CI.** An `e2e` job in `.github/workflows/ci.yml`, on `pull_request` only: a
Postgres service, `npx playwright install --with-deps chromium`, `npm run test:e2e`, the
`playwright-report` uploaded on failure. The phase's backlog rows move to the archive.

## Status

- [x] **0 · Docs.** This doc, its row in `docs/README.md`, ADR-0037, the backlog's
  Playwright row `planned (phase 6.3)`, the e2e rule in `CLAUDE.md` and the
  `chain-steps` skill, the root README's scripts. — *2026-10-10.* Docs only; `npm
  run test:e2e` is documented ahead of step 4.
- [x] **1 · The flaky full `npm test`.** — *2026-10-10.* No cause found, so the
  timeout was raised (api `hookTimeout` 30 s). The stall did not recur in 3 full runs;
  if an e2e step sees one, it is still unexplained, not fixed.
- [x] **2 · The web↔API contract test.** — *2026-10-10.* No mismatch found. The alias
  is vitest-only: no api tsconfig maps `@/`, so tsc never checks the spec (as with every
  api test) and an editor marks its `@/` imports unresolved.
- [ ] **3 · The seed.**
- [ ] **4 · Playwright scaffold.**
- [ ] **5 · Shell and dashboard.**
- [ ] **6 · Vacancies and Inbox.**
- [ ] **7 · The vacancy page.**
- [ ] **8 · Applications.**
- [ ] **9 · Sign-in, passkeys, consent.**
- [ ] **10 · CI.**
