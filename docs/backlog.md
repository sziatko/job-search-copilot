# Backlog

Work not yet planned into a phase, in two lists: **ideas** (what the app does not do
yet) and **improvements and fixes** (what exists and works wrongly, slowly or
awkwardly). A phase that takes a row deletes it when the row is done; so does a row
that no longer applies.

## Ideas

| Item | Notes |
| --- | --- |
| **Deploy and a public HTTPS URL** | claude.ai reaches an HTTP MCP server from Anthropic's servers, so not `localhost`. The plan: one VPS, the compose stack on the Dockerfiles' `production` stages, Caddy in front (a subdomain per service, automatic HTTPS), images built in GitHub Actions and pushed to ghcr.io, `docker compose pull && up -d` over SSH, `prisma migrate deploy` as a one-shot container before the api, a nightly `pg_dump` off the server. n8n and the database move there too. Needs: a domain, `Secure` cookies, `PASSKEY_RP_ID` = the domain (local passkeys do not carry over), production OAuth redirect URIs, and `/api/docs` closed or guarded (it is outside Nest's guard). |
| **Public demo** | After the deploy. The same images, a separate database, `DEMO_MODE=true`: an email + password sign-in that exists only in that mode, one shared demo user who owns the seed, MCP / API keys / social sign-in off, a rate limit. Made-up data only: the e2e seed, reset nightly by `resetToSeed`. |
| **`/profile` page** | Only the Passkeys and API keys cards are real; the rest is a `ComingSoon` panel. Needs a candidate-profile store, where the master resumes would live (next row). |
| **Tailor a resume from the vacancy page** | A button runs what the `resume-ats-tailor` skill does today. The posting text is in JSC already; the master resumes are not — they move into `/profile` first. |
| **A UI for the status journal, and comment CRUD** | The `StatusChange` journal and the `Comment` table exist; nothing shows the journal, and comments can only be appended. |
| **Recent activity: every move, and a full table** | The dashboard shows the 6 latest **pipeline** moves only. Wanted: every move, wherever it came from — the journal does not record a move's source yet — then a scrolling table of the latest 100 with a status filter. Overlaps the journal UI above. |
| **Collectors in the app, not n8n** | After the deploy and the demo, its own phase. Sources collected by code in this repo — versioned, tested, configurable in the app — set up by a prompt: the profile says what to look for, an AI turns it into each source's config. A sketch: an `apps/worker` workspace on a schedule, one module per source, writing through `core`'s intake (invariant 1). JSON APIs (justjoin.it, nofluffjobs) are easy; LinkedIn needs a hosted scraper; the email flow can stay in n8n longest. Today the n8n workflows (recommendation emails, a LinkedIn scraper) live outside the repo. |
| **AI scoring and the email flow in n8n** | A cloud model in a separate n8n flow, writing through `POST /vacancies/analysis`; the email-driven status updates move into n8n too. To design. |
| **Company exclusion list** | Companies the user wants no vacancies from (a ban for some months, a rejection after an interview). Edited in `/profile`, added in one click from a vacancy page. To decide: an optional "until" date; whether an excluded company's postings land `FILTERED_OUT` or are not stored; the analysis queue skips them. Matches through company aliases (next row). |
| **Company aliases** | One company under several names. Options: an alias table applied wherever names are compared, or a `Company` entity the vacancies point to (bigger: intake, the MCP tools, `/stats`). Then store the company key as an indexed column: today `companyMatchCounts` (`company.ts`) reads every distinct company name on each list call. |
| **Merge duplicate vacancies** | Low priority. A merge action on the vacancy page or the company modal. To decide: what moves to the main row (comments, the journal, a second url), and whether the other is deleted or hidden. |
| **Score breakdown per criterion** | Store each part of `matchScore` (technical match, location, growth, deal-breakers) 0–100: a child table written once with the analysis (invariant 2); `matchScore` / `recommendation` stay the headline. Touches the analyzer skill, the MCP and REST analysis inputs, a web view. |
| **Filters per column, in a modal** | A range for the date and the score, checkboxes for the recommendation and the status, "contains" for company, title and comments; per-column sorting with it. The REST lists take one `recommendation` and no ranges today, so the API grows too. It would join the controls of `SearchModal`. |
| **Live updates over WebSocket** | Statuses change without the user (an email read by an agent). The server pushes the change; the web updates without a reload. |
| **Google One Tap / FedCM** | An existing Google session signs in by itself. |
| **GitHub sign-in** | Plain OAuth 2.0, no `id_token`: the email comes from `/user/emails` (the primary, verified one). Decide whether it is a trusted provider for account linking. |
| **Email sign-in (OTP or magic link)** | Allows passkey-first sign-up and recovery when both social accounts are lost. Needs SMTP or Resend. |
| **Turborepo / Nx** | npm workspaces is enough for four packages. Wanted for learning, in its own phase; would also answer the `core` dev-loop row below. |

## Improvements and fixes

| Item | Notes |
| --- | --- |
| **`core` dev-loop friction** | A `core` edit needs a rebuild and an app restart. Candidates: tsconfig `paths` → `src` with an swc / tsx runner, or TS project references. [ADR-0003](decisions/0003-core-consumed-as-dist.md). |
| **MCP SDK v2** | The SDK is split into v2 packages (`@modelcontextprotocol/server`, `/express`, `/node`). Moving touches every `*.tools.ts`, `server.ts`, `http-app.ts` and the tests. |
| **`record_application` by name meets old filtered-out rows** | Every vacancy is a record-or-link candidate, the never-analysed `FILTERED_OUT` ones included, so `AmbiguousVacancyMatchError` fires more often than it should. Nothing is lost — the error lists the ids, the agent retries with `vacancyId` — but it costs a round-trip. Fix: among several matches, prefer analysed rows, or rows not `FILTERED_OUT`. |
| **TanStack Form** | At the first genuinely complex form. [ADR-0020](decisions/0020-web-router-tanstack.md). |
| **A tip bubble on the top visible row is clipped** | The scroll box cuts it. Flip it below the control there; needs `useVirtualRows` to expose the row's offset. |
| **The full `npm test` stalls now and then** | An api `beforeAll` or a web `findBy*` times out under load and passes on a rerun. No cause found; the api `hookTimeout` is raised to 30 s meanwhile. |
| **`isolate: false` in vitest: prove or drop** | Every project turns per-file isolation off for a speed-up measured once (the root `vitest.config.mts` says how much), at the price of state leaking between files — re-measure, and drop it if the gain is small or it turns out to cause the stalls above. |
| **One status write, one comment route** | `VacancyService.updateStatus` and `ApplicationService.updateStatus` are two routes into the same `writeStatus`, and a comment on any vacancy, applied to or not, is posted through `PATCH /applications/:id` (`addComment` in `apps/web/src/lib/vacancies/api.ts`). |
| **Keyset paging in `VacancyService.list`** | The cursor row stays in the result through `{ OR: [where, { id: cursor }] }` and Prisma pages the nullable sort in memory, reading every row after the cursor — the `Limit:` comment there names the ceiling; a hand-written keyset on (sort key, id) reads one page. |
| **`StatsService.get` reads no snapshot** | Its counts are separate queries run side by side, so a write landing mid-request (the analyzer moving a vacancy out of `NEW`) can count one vacancy in two buckets or none; one `REPEATABLE READ` transaction reads them all at one instant. |
| **A `contracts` package for api, mcp and web** | One Prisma-free workspace of zod schemas the three apps share would end the hand-written duplication that [ADR-0012](decisions/0012-web-hand-written-contract.md) accepts and invariant 5 states, so both are rewritten with it. |
| **Local sign-in without an OAuth client** | Signing in locally needs a Google or LinkedIn OAuth client; a dev script could mint a session cookie for a local user the way `sessionCookie` in `e2e/session.ts` does. |
