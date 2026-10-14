# 0032 — Same company = an equal normalised name

- Status: Accepted (amends 0025, decision 2)
- Phase: 4.3   ·   Date: 2026-10

## Context

There is no `Company` entity: a vacancy stores the name the posting gave, so one
company arrives under several spellings. ADR-0025 grouped them by substring: the
company button's `companyMatchCount` and the modal's list were "every vacancy whose
`company` contains this row's company". That rule only works in one direction. On
the dev DB, `contoso` listed 11 other vacancies and `contoso Polska`
listed 4: `contoso` is inside `contoso Polska`, but not the other way round.

Across the dev DB's company names (2026-10-02), the same rule also:

- **joined unrelated companies**: `iO` matched 26 other names (`Apollo.io`,
  `Nerdex`, `Software Garden`, …), `Ark` matched `Parkway`, `Nord` matched
  `Nordstar People`, `Tailspin` matched `Tenth Tailspinion Group`;
- **missed spellings where neither name contains the other**: `Vexa Polska` /
  `Vexa Poland`.

## Decision

1. **`companyKey(name)`** in `packages/core/src/company.ts`: the vacancy
   log's `normalizeCompanyKey` (case, punctuation, legal forms such as `Sp. z o.o.`,
   `Inc`, `B.V.`; intake's key since [ADR-0033](0033-unscored-vacancies-in-one-table.md)) applied after dropping `( … )`
   notes, then a trailing country or region word (`Polska`, `Poland`, `Spain`,
   `Latam`, …) is dropped as well. A name that is nothing but those words keeps
   itself.
2. **Same company ⇔ equal keys.** This is an equivalence, so every spelling of a
   company sees the same rows and the same count.
3. **`companyMatchCount`** counts by key. One `groupBy` on `company`, summed per key.
   Amended in phase 5 (2026-10-03): both the count and `sameCompanyAs` leave
   `FILTERED_OUT` rows out — the old log's screened-out postings are noise in "have I
   dealt with these people before?" — so the count is still exactly the modal's rows.
4. **A new list filter, `sameCompanyAs`**, on `GET /vacancies` and
   `GET /applications`: every stored spelling of the name's company. The company modal
   (both of its queries) and the vacancy page's other vacancies use it.
5. **The substring `company` filter stays.** MCP and the skills look vacancies up
   with it (a partial name, a name taken from an email), so neither changes.

## Why this and not the alternatives

- **Substring both ways** ("either name contains the other"). A smaller change, and
  it fixes the contoso pair. But it keeps every false match listed above and adds
  more (`Spilberg (client: …)` contains `iO`). It also isn't transitive: with three
  spellings, the middle one sees more rows than the outer two, so counts still
  disagree.
- **Grouping by the first word.** That merges `Software Grove` with `Software
  Mansion`, and `The Flex` with `The Trade Desk`.
- **A `Company` table, or normalising names when they are saved.** That needs a
  migration, and it throws away what the analyzer wrote (`Fabrikam (partner
  company, anonymized)` carries meaning). Worth revisiting if the key stops being
  enough.

## Consequences

- On the dev DB the key forms 20 groups of two or more spellings (contoso, Vexa,
  Lumen, BRANDT, Fabrikam ×6, 9Q, Lumora, …), and none of them joins unrelated
  companies.
- **Accepted miss:** a longer name that is still the same company, such as
  `Quokka` / `Quokka Technologies`, `Velto` / `Velto Beveiligingstechniek B.V.` or
  `co.loop` / `co.loop Talents`. The old rule found these only from the short
  name.
- Both helpers read every distinct company on each list call. That is fine at a few
  hundred names (a `ponytail:` note marks it); at scale, store the key in an indexed
  column.

## What this constrains — breaks if you change it

- **The button's count and the modal's list must use the same rule.** The badge is
  `count - 1` of what the modal lists. Changing one without the other brings back
  the 11-vs-4 disagreement.
- **`normalizeCompanyKey` is the log's stored key.** Changing it to suit this rule
  needs a backfill of `VacancyLogEntry.companyKey`. Add to `companyKey` instead.
- **The web's MSW fake** (`apps/web/src/test/msw/handlers.ts`) mirrors the rule only
  as lowercased equality. Core's tests own the rule itself.

## Related

- [ADR-0025](0025-vacancies-list-search-server-side.md): the substring count this
  replaces for the company button and the modal.
- [ADR-0033](0033-unscored-vacancies-in-one-table.md): intake's company key this builds on
  (the log's, ADR-0026, deleted in phase 5).
- [`../phases/phase-4.3.md`](../phases/phase-4.3.md): step 7.
- [`../contracts.md`](../contracts.md): `sameCompanyAs` and `companyMatchCount`.
