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
 * ponytail: an escaped pattern cannot be served by the `company`/`title` trigram
 * indexes (Prisma binds the value as a parameter, so the backslashes are not in
 * the index terms) — a leading-`%` scan either way, ~300 rows today. Do the
 * escaping in SQL with an `ESCAPE` clause if the table ever gets big enough for
 * the scan to hurt; Prisma's `contains` has no way to say it.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
