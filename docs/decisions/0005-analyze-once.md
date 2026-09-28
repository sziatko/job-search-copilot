# 0005 — Analyze-once: `save()` skip-if-exists, `{ created, vacancy }`, POST 201/200

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
`save()` was originally an **upsert** keyed by `applyUrl`: re-submitting a vacancy
overwrote `matchScore` / `recommendation` / `estimationComment` / `fullText`. That
silently destroyed a prior analysis if the analyzer re-ran with worse or empty
data, with no history and no audit.

The user's decision (verbatim intent): *"a recorded vacancy we don't write again —
it's already analysed, skip it. `updatedAt` reacts to `userAction` changes."*

## Decision
`save()` is **create-if-absent**:

1. `findUnique` by `applyUrl`; if it exists, return it untouched.
2. Otherwise `normalizeRecommendation` → `create`.
3. If the `create` loses a race (unique-constraint `P2002`), re-`findUnique` and
   return the winner.

Return type is `{ created: boolean; vacancy: Vacancy }`
(`SaveVacancyResult`) so callers can tell which path ran.

Transport consequences:
- **REST** — `POST /api/v1/vacancies` → `201 Created` +
  `Location: /api/v1/vacancies/{id}` when a row is created; `200 OK`
  (same body) when the `applyUrl` already existed. Stays a `POST` (the id is
  server-assigned, so there's no client-known URI to `PUT` to).
- **MCP** — `save_vacancy` returns `{ created, vacancy }` as JSON text;
  the analyzer reads `created` to know whether its analysis was stored or dropped.

## Why this and not the alternatives
- **Keep upserting** — the data-loss problem above. Rejected by the user.
- **Append-only analysis-history table** — full audit, classic pattern, but more
  schema + query complexity than a single-user tool that analyses each URL once
  actually needs. Considered and set aside.
- **Inline `previousAnalysis Json?` snapshot** — cheaper middle ground, but "one
  step of history" isn't a requirement anyone stated.
- **On the HTTP verb:** `PUT /vacancies/by-url/{encoded}` is the
  RESTfully-purest match for idempotent-by-natural-key, but the encoded-URL-in-path
  ergonomics aren't worth it. `@HttpCode(200)` always was the lighter option, but
  it drops the create/skip signal the MCP caller needs — so the `{ created }`
  flag threads through the whole stack instead.

## Consequences
- Re-submitting a vacancy is a cheap no-op; the analyzer can be careless about
  re-runs.
- `updatedAt` only ever moves on the user's changes (status, salary, CV) — the
  analysis is never rewritten. The semantic date of a move is `statusChangedAt`.
- The `{ created, vacancy }` shape ripples: `packages/core` (`save` +
  `SaveVacancyResult` export), `apps/api` controller (`@Res` +
  status/`Location`), `apps/mcp` `server.ts`, and the service / mcp / e2e specs.

## What this constrains — breaks if you change it
- Reverting `save()` to an upsert → stored analyses get clobbered; the API's
  `200`-on-existing branch and the MCP `created` flag lose meaning; the
  "second save leaves it untouched" tests in
  `packages/core/src/vacancy.service.spec.ts` and
  `apps/mcp/src/server.spec.ts` fail.
- Changing `save()`'s return to a bare vacancy again → the API controller can't
  choose 201 vs 200; the MCP analyzer can't detect a dropped analysis.
- Dropping the `Location` header on create → `apps/api/test/vacancies.e2e.spec.ts`
  (`expect(res.headers.location)`).

## Related
[`../domain-model.md`](../domain-model.md) ("Analyze-once"),
[`../contracts.md`](../contracts.md), [ADR-0004](0004-one-service-two-transports.md),
`packages/core/src/vacancy.service.ts`.
