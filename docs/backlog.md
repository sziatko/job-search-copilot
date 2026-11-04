# Backlog

Work not yet planned into a phase, in two lists: **ideas** (what the app does not do
yet) and **improvements and fixes** (what exists and works wrongly, slowly or
awkwardly). A phase that takes an item deletes its section when the item is done; so
does an item that no longer applies.

## Ideas

### Public demo

Its own phase, when there is time for it. The same images, a separate database,
`DEMO_MODE=true`: an email + password sign-in that exists only in that mode, one shared
demo user who owns the seed, MCP / API keys / social sign-in off, a rate limit. Made-up
data only: the e2e seed, reset nightly by `resetToSeed`.

### `/profile` page

The candidate profile is a `ComingSoon` panel there. It needs a store, where the master
resumes would live ([Tailor a resume from the vacancy
page](#tailor-a-resume-from-the-vacancy-page)).

### Tailor a resume from the vacancy page

A button runs what the `resume-ats-tailor` skill does today. The posting text is in JSC
already; the master resumes are not — they move into `/profile` first.

### A UI for the status journal, and comment CRUD

The `StatusChange` journal and the `Comment` table exist; nothing shows the journal, and
comments can only be appended.

### Recent activity: every move, and a full table

The dashboard shows the 6 latest **pipeline** moves only. Wanted: every move, wherever
it came from — the journal does not record a move's source yet — then a scrolling table
of the latest 100 with a status filter. Overlaps the journal UI above.

### Collectors in the app, not n8n

After the demo, its own phase. Sources collected by code in this repo — versioned,
tested, configurable in the app — set up by a prompt: the profile says what to look for,
an AI turns it into each source's config. A sketch: an `apps/worker` workspace on a
schedule, one module per source, writing through `core`'s intake (invariant 1). JSON
APIs (justjoin.it, nofluffjobs) are easy; LinkedIn needs a hosted scraper; the email
flow can stay in n8n longest. Today the n8n workflows (recommendation emails, a LinkedIn
scraper) live outside the repo.

### AI scoring and the email flow in n8n

A cloud model in a separate n8n flow, writing through `POST /vacancies/analysis`; the
email-driven status updates move into n8n too. To design.

### Company exclusion list

Companies the user wants no vacancies from (a ban for some months, a rejection after an
interview). Edited in `/profile`, added in one click from a vacancy page. To decide: an
optional "until" date; whether an excluded company's postings land `FILTERED_OUT` or are
not stored; the analysis queue skips them. Matches through company aliases ([Company
aliases](#company-aliases)).

### Company aliases

One company under several names. Options: an alias table applied wherever names are
compared, or a `Company` entity the vacancies point to (bigger: intake, the MCP tools,
`/stats`). Then store the company key as an indexed column: today `companyMatchCounts`
(`company.ts`) reads every distinct company name on each list call.

### Catch duplicates intake misses

Many lately. Intake matches only by url, then by `(companyKey, titleKey)`
(`vacancy-intake.service.ts`), so a posting with a new url and a slightly different
title (`Senior Frontend Developer` / `Senior Front-End Engineer (React)`) or company
(`Acme` / `Acme Polska`) comes in again. First look at a few real ones to see which kind
dominates. The idea: a fuzzy match is never discarded automatically — a separate posting
would vanish without a trace — so the analyzer catches them: an MCP tool
(`find_similar_vacancies`) returns candidates with the same `companyGroupKey` and a
similar title or text (`pg_trgm` `similarity()` is installed), the analyzer reads both
and decides whether it is the same offer. Today it already notices some and writes a
"duplicate" comment, nothing more. Wanted: the analyzer does not skip a duplicate on its
own — the user picks which one to apply through (LinkedIn over justjoin.it, say). It
scores the posting as usual and marks it with a tag "duplicate of #id", the comment saying
the other one's status (applied, rejected, not yet acted on); the user skips it. Open: when
the other one is already applied to, is a `SKIP` from the analyzer fine after all?
Optional, if exact copies dominate: a hash of the normalised `fullText` in an indexed
column, which intake can treat as a sure duplicate — only when the text arrives, and
intake often has none. [Merging](#merge-duplicate-vacancies) covers a duplicate found
after both were acted on.

### Merge duplicate vacancies

Low priority. A merge action on the vacancy page or the company modal. To decide: what
moves to the main row (comments, the journal, a second url), and whether the other is
deleted or hidden.

### Score breakdown per criterion

Store each part of `matchScore` (technical match, location, growth, deal-breakers)
0–100: a child table written once with the analysis (invariant 2); `matchScore` /
`recommendation` stay the headline. Touches the analyzer skill, the MCP and REST
analysis inputs, a web view.

### Filters per column, in a modal

A range for the date and the score, checkboxes for the recommendation and the status,
"contains" for company, title and comments; per-column sorting with it. The REST lists
take one `recommendation` and no ranges today, so the API grows too. It would join the
controls of `SearchModal`.

### Sort by column

A click on a column header sorts by it, a second click flips the direction. Wanted
first: the date and the match score; then company, title, and the status (useful only
when the list shows every status). The vacancies page always asks for
`sort: 'recommended'` today (`useVacancies.ts`), and `ORDER_BY` in `vacancy.service.ts`
knows only `newest` and `recommended`, so the API takes a sort key and a direction. The
default stays as it is. Overlaps [Filters per column](#filters-per-column-in-a-modal)
above; keyset paging (Improvements) needs each new sort key to page correctly.

### Filter by tag, and a tag with a date

Tags exist ([ADR-0042](decisions/0042-tags-written-by-anyone.md)); two uses are not built.
Filter a list by tag, which joins [Filters per column](#filters-per-column-in-a-modal). A tag
with an optional date ("chase on 3 Nov"), shown on the dashboard when due.

### Live updates over WebSocket

Statuses change without the user (an email read by an agent). The server pushes the
change; the web updates without a reload.

### Google One Tap / FedCM

An existing Google session signs in by itself.

### GitHub sign-in

Plain OAuth 2.0, no `id_token`: the email comes from `/user/emails` (the primary,
verified one). Decide whether it is a trusted provider for account linking.

### Email sign-in (OTP or magic link)

Allows passkey-first sign-up and recovery when both social accounts are lost. Needs SMTP
or Resend.

### Turborepo / Nx

npm workspaces is enough for four packages. Wanted for learning, in its own phase; would
also answer [`core` dev-loop friction](#core-dev-loop-friction) below.

## Improvements and fixes

### A body nested thousands of levels deep

Left over from the odd-input fixes: a JSON body nested about 3000 levels overflows
`plainToInstance`, which should answer a 500 (seen in a direct call, not over HTTP). The guard
runs first, so only a signed-in caller reaches it, and nothing is written. A depth limit in the
body parser would close it.

### A rejected item in `save_vacancies_batch`

Its error does not say which item stopped the batch, so the caller sends all of it again,
every `fullText` included; that is safe by `applyUrl`, only costly. Checking the names at the
top of `saveMany` would stop a bad name before anything is written. A resend also misses the
first row when `applyUrl` is not http (`z.url()` takes `mailto:`): `save()` keys such a row on
a `tracker://` URL with the date in it, so past UTC midnight it makes a second vacancy.

### Security leftovers

Found by the 2026-10-27 security review and left as they are. The API parses JSON bodies
up to 5 MB before its guard runs (the MCP parses after auth): a 100 KB default with 5 MB
only on intake and save would close it. `companyGroupKey`'s place-suffix loops are
bounded only by the input caps. Swagger is gated on `NODE_ENV !== 'production'` and
`NODE_ENV` defaults to `development`, so an api started without it serves `/api/docs`
(the production image sets it). Postgres sits on the shared `web` network (the infra
repo) rather than one only its clients join.

### Uptime monitoring

Nothing notices when prod is down: healthchecks.io watches only the nightly backup. An
outside check of `jsc.<domain>` and `jsc-mcp.<domain>` (a healthchecks.io HTTP check, or
UptimeRobot) that emails when either stops answering. The api's `/health` sits outside
the `/api` path Caddy routes: from outside, `/health` is the web's `index.html` (200
whatever the api does) and `/api/health` a 404 — the check needs the api's health under
`/api`, or a keyword match.

### A deploy that did not happen goes unnoticed

Seen 2026-10-30, three merges in two minutes: one deploy failed in `deploy.sh`'s
`docker compose pull` (a GHCR connection reset), and the newest was cancelled by the
`deploy` concurrency group ("a higher priority waiting request"), so `main` was ahead of
prod until a manual re-run. GitHub emails a failure, not a cancel. Options: a retry
around the pull; a check that the deployed `JSC_TAG` is `main`'s head (a scheduled
workflow, or the uptime check above), which catches a cancel and a failure alike.

### Better Auth rate limits share one bucket

The api logs "Rate limiting could not determine a client IP": behind Caddy it resolves
no client IP, so each path's limit is one bucket for everyone — `/oauth2/token` (the
OAuth provider's 20 a minute) for every MCP client's refresh, and the sign-in paths for
every visitor. Set `advanced.ipAddress.ipAddressHeaders` (`x-forwarded-for`, which Caddy
sets) or `trustedProxies` in `createAuth`.

### `core` dev-loop friction

A `core` edit needs a rebuild and an app restart. Candidates: tsconfig `paths` → `src`
with an swc / tsx runner, or TS project references.
[ADR-0003](decisions/0003-core-consumed-as-dist.md).

### npm majors

Nothing reminds of a new major: `dependabot.yml` watches only GitHub Actions and Docker,
and Dependabot opens npm PRs only for security fixes. Either `npm` in `dependabot.yml`
(weekly, grouped, majors in their own PR) or an `npm outdated` pass now and then.

### Node 26

Once it is LTS. One PR: the three Dockerfiles' `node:24-alpine`, `ci.yml`'s
`node-version`, local dev. Dependabot ignores Node majors (`dependabot.yml`), so nothing
will remind.

### MCP SDK v2

The SDK is split into v2 packages (`@modelcontextprotocol/server`, `/express`, `/node`).
Moving touches every `*.tools.ts`, `server.ts`, `http-app.ts` and the tests.

### `record_application` by name meets old filtered-out rows

Every vacancy is a record-or-link candidate, the never-analysed `FILTERED_OUT` ones
included, so `AmbiguousVacancyMatchError` fires more often than it should. Nothing is
lost — the error lists the ids, the agent retries with `vacancyId` — but it costs a
round-trip. Fix: among several matches, prefer analysed rows, or rows not
`FILTERED_OUT`.

### TanStack Form

At the first genuinely complex form. [ADR-0020](decisions/0020-web-router-tanstack.md).

### A tip bubble on the top visible row is clipped

The scroll box cuts it. Flip it below the control there; needs `useVirtualRows` to
expose the row's offset.

### The full `npm test` stalls now and then

An api `beforeAll` or a web `findBy*` times out under load and passes on a rerun. No
cause found; the api `hookTimeout` is raised to 30 s meanwhile.

### `isolate: false` in vitest: prove or drop

Every project turns per-file isolation off for a speed-up measured once (the root
`vitest.config.mts` says how much), at the price of state leaking between files —
re-measure, and drop it if the gain is small or it turns out to cause the stalls above.

### One status write, one comment route

`VacancyService.updateStatus` and `ApplicationService.updateStatus` are two routes into
the same `writeStatus`, and a comment on any vacancy, applied to or not, is posted
through `PATCH /applications/:id` (`addComment` in `apps/web/src/lib/vacancies/api.ts`).

### Keyset paging in `VacancyService.list`

The cursor row stays in the result through `{ OR: [where, { id: cursor }] }` and Prisma
pages the nullable sort in memory, reading every row after the cursor — the `Limit:`
comment there names the ceiling; a hand-written keyset on (sort key, id) reads one page.

### `StatsService.get` reads no snapshot

Its counts are separate queries run side by side, so a write landing mid-request (the
analyzer moving a vacancy out of `NEW`) can count one vacancy in two buckets or none;
one `REPEATABLE READ` transaction reads them all at one instant.

### A `contracts` package for api, mcp and web

One Prisma-free workspace of zod schemas the three apps share would end the hand-written
duplication that [ADR-0012](decisions/0012-web-hand-written-contract.md) accepts and
invariant 5 states, so both are rewritten with it.

### Local sign-in without an OAuth client

Signing in locally needs a Google or LinkedIn OAuth client; a dev script could mint a
session cookie for a local user the way `sessionCookie` in `e2e/session.ts` does.

### Biome rules left off

`noImportCycles` reports 125 cycles, every one through `router.tsx`: the router imports
the pages and the pages import their routes from it (code-based routing), so turning it
on means file-based routing or the routes in a module of their own.
`noUndeclaredDependencies` reports 92, all false: `vitest` and the e2e imports are
declared in the root `package.json`, and the rule reads only the nearest one. The
complexity group (`noExcessiveCognitiveComplexity` and the like) is untried; at `warn`
first.

### Dead code and unused exports

Nothing finds them: Biome sees one file at a time. knip in CI, across the workspaces.

### Migrations are not linted

A migration that locks a table or drops a column in one go passes review unseen. squawk
on `packages/core/prisma/migrations` in CI.

### `noUncheckedIndexedAccess`

Off in every tsconfig, so `arr[i]` and `record[key]` type as never `undefined`. Turning
it on flags every index read at once; one workspace at a time.
