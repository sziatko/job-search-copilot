# 0025 — The vacancies list: server-side search, a derived company count, and what stays out of the list item

- Status: Accepted · Date: 2026-09

## Context
The vacancy tables load a page at a time ([ADR-0030](0030-cursor-paging.md)), so a
search over what the page holds would miss everything not loaded yet. Each row also
shows whether its company appeared before. Both reach into `core`'s `list()`, whose
item shape feeds the API, MCP and the web at once, and is kept by hand in `core` and
in the web's schema ([ADR-0012](0012-web-hand-written-contract.md)).

## Decision
1. **Search is server-side**, one `search` param: `company` OR `title`, ILIKE
   `%term%` with `%` / `_` / `\` escaped (`escapeLikePattern`), ANDed with the other
   filters. Over REST only `company` and `search` exist; core and MCP also take
   `title`.
2. **`companyMatchCount` is derived on the list item**: how many of the user's
   vacancies are the same company by [ADR-0032](0032-same-company-normalised-name.md)'s
   key — the same rows `sameCompanyAs` lists in the company-history modal. Computed in
   `core` (`companyMatchCounts` in `domain/company.ts`), for `/applications`' list too.
   With `hasAnalysis` and `hasText` it goes through one `withDerivedFields`.
3. **A derived field is `.optional()` in the web schema**, because the same schema
   parses the `PATCH …/status` response, which carries none.
4. **Application data stays out of the vacancy list item.** The company modal reads
   the company's vacancies and its applications (`sameCompanyAs` on both, its own
   query keys) and joins them on the vacancy id.

## Why this and not the alternatives
- **Client-side search** — searches only the loaded page, and says nothing about the
  rest.
- **Separate `company` and `title` params for one search box** — the client ORs them
  itself, and the contract grows a field to say one thing.
- **Search over the analyzer's comment too** — long free text, no trigram index; the
  ask was company and title.
- **Application dates on every vacancy row** — they would ride in every row of every
  table and both MCP list tools, for a modal that may never open.
- **A company-history endpoint** — a new surface for a read two endpoints answer.

## Consequences
- Search finds what was never loaded; `total` stays "rows matching the filter".
- The company button costs no request: the count comes with the list. The cost: one
  more query per `list()` call.
- One place the hand-written contract is softened: a server that stops sending a
  derived field degrades (no company button) instead of failing loudly.

## What this constrains — breaks if you change it
- `search` as an AND → a term naming a company or a role stops matching, silently.
- `companyMatchCount` and `sameCompanyAs` counting different rows → the button's
  number disagrees with the modal it opens. Both use `companyGroupKey`.
- A derived field made required in the web → every status change fails to parse
  ("unexpected format").
- The modal's join key (the vacancy id on both sides) renamed → every row reads "not
  applied": a failed join looks like a company nobody applied to.

## Related
[ADR-0030](0030-cursor-paging.md), [ADR-0032](0032-same-company-normalised-name.md),
[`../contracts.md`](../contracts.md).
