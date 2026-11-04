import type { Prisma } from '@prisma/client';

/**
 * LIKE/ILIKE pattern escaping. Kept in one module because every `contains` filter
 * in this package feeds a value the user typed into a pattern, and each one gets
 * it wrong the same way in isolation.
 */

/**
 * Neutralize the LIKE metacharacters in a user-supplied term, so `%` and `_` are
 * searched for literally instead of meaning "anything" and "any one character".
 *
 * Without this, `?search=%` matches the whole table and a company named `100%
 * Remote` cannot be searched for at all. `\` is escaped too, and **must be
 * escaped first** — Postgres' LIKE default escape character is the backslash, so
 * a term like `A\B` would otherwise become the pattern `%A\B%` and match `AB`.
 *
 * One `replace` call, on purpose: `[\\%_]` matches each character of the input
 * exactly once, so nothing introduced by this pass is escaped a second time.
 *
 * Callers still pass the result to `contains` — this escapes a *value*, it does
 * not build a pattern, so the surrounding `%` Prisma adds stays a wildcard.
 *
 * Limit: an escaped pattern cannot be served by the `company`/`title` trigram indexes
 * (Prisma binds the value as a parameter, so the backslashes are not in the index
 * terms) — a leading-`%` scan either way, fine at a few thousand rows. Past that, do
 * the escaping in SQL with an `ESCAPE` clause; Prisma's `contains` cannot say it.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

const contains = (term: string) =>
  ({ contains: escapeLikePattern(term), mode: 'insensitive' }) as const;

export const INT4_MAX = 2_147_483_647;

/** The vacancy id a search term names, `123` or `#123`. A number past Int4 names none:
 * Postgres would refuse it as an id, a 500 for what is only a search that finds nothing. */
function idInTerm(term: string): number | undefined {
  if (!/^#?\d+$/.test(term)) return undefined;
  const id = Number(term.replace('#', ''));
  return id <= INT4_MAX ? id : undefined;
}

/**
 * The free-text clauses both lists share, to AND together: `search` (a page's search
 * box) widens to company OR title OR, when the term is a number, id; `company` / `title`
 * (the MCP tools) each narrow. Each term is escaped here, so a caller passes what the
 * user typed.
 */
export function textFilters(filters: {
  search?: string;
  company?: string;
  title?: string;
}): Prisma.VacancyWhereInput[] {
  const clauses: Prisma.VacancyWhereInput[] = [];
  if (filters.search) {
    const id = idInTerm(filters.search);
    clauses.push({
      OR: [
        { company: contains(filters.search) },
        { title: contains(filters.search) },
        ...(id === undefined ? [] : [{ id }]),
      ],
    });
  }
  if (filters.company) clauses.push({ company: contains(filters.company) });
  if (filters.title) clauses.push({ title: contains(filters.title) });
  return clauses;
}
