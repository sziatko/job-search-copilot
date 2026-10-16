# 0032 — Same company = an equal normalised name

- Status: Accepted · Date: 2026-10

## Context
There is no `Company` entity: a vacancy stores the name the posting gave, so one
company arrives under several spellings. "Same company" — for the company button's
count and the company-history modal — cannot be a substring match: it works in one
direction only (`Acme` is inside `Acme Polska`, not the other way round, so the two
spellings see different rows), joins unrelated names (`Ark` inside `Starkline`), and
misses spellings where neither contains the other (`Acme Polska` / `Acme Poland`).

## Decision
1. **`companyGroupKey(name)`** (`packages/core/src/domain/identity.ts`): drop `( … )`
   notes, apply `normalizeCompanyKey` (case, punctuation, legal forms such as
   `Sp. z o.o.`, `Inc`, `B.V.`), then drop a trailing country or region word (`Polska`,
   `Poland`, `Latam`, …). A name made only of such words keeps itself.
2. **Same company ⇔ equal keys.** An equivalence: every spelling sees the same rows and
   the same count.
3. **`companyMatchCount`** counts by key — one `groupBy` on `company`, summed per key —
   over every status but `FILTERED_OUT` (`SAME_COMPANY_STATUSES`): screened-out postings
   are noise in "have I dealt with these people before?".
4. **`sameCompanyAs`**, a list filter on `GET /vacancies` and `GET /applications`: every
   stored spelling of the name's company, the same statuses. The company modal and the
   vacancy page's other vacancies use it.
5. **The substring `company` filter stays**, for MCP and the skills (a partial name, a
   name from an email).

## Why this and not the alternatives
- **Substring both ways** — keeps the false matches, and is not transitive: with three
  spellings, the middle one sees more rows than the outer two.
- **The first word** — merges `Globex Systems` with `Globex Ventures`, two companies.
- **A `Company` table, or names normalised on save** — a migration, and it loses what
  the analyzer wrote (`Fabrikam (partner company)` carries meaning). The backlog's
  aliases row.

## Consequences
- **Accepted miss:** a longer name for the same company (`Contoso` / `Contoso
  Technologies`) is two companies.
- Both helpers read every distinct company name on each list call: fine at a few
  hundred names per user; at scale, an indexed column of the key.

## What this constrains — breaks if you change it
- **The count and `sameCompanyAs` must use the same rule and statuses** — the button's
  number is what the modal lists.
- **`normalizeCompanyKey` is the stored `Vacancy.companyKey`**, intake's and
  `record()`'s match by name. Changing it to suit this rule needs a backfill and makes
  the posting match coarser (`identity.ts` says why the keys differ). Change
  `companyGroupKey` instead.
- **The web's MSW fake** mirrors the rule only as lowercased equality; core's tests own
  the rule.

## Related
[ADR-0025](0025-vacancies-list-search-server-side.md), [ADR-0033](0033-unscored-vacancies-in-one-table.md),
[`../contracts.md`](../contracts.md).
