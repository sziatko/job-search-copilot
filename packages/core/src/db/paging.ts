/**
 * Cursor paging (ADR-0030), shared by the paged lists. One row past the page answers
 * "is there a next page" without a second query.
 *
 * No `skip: 1`: it assumes the cursor row is in the result, and a row that has left
 * the filter since (triaged out of NOT_REVIEWED) is not — the skip would drop the next
 * real row instead. The cursor row is fetched when it still matches, and dropped here.
 */
export function cursorArgs(
  cursor: number | undefined,
  limit: number,
): { take: number; cursor?: { id: number } } {
  return cursor === undefined ? { take: limit + 1 } : { cursor: { id: cursor }, take: limit + 2 };
}

export function toCursorPage<T extends { id: number }>(
  rows: T[],
  cursor: number | undefined,
  limit: number,
) {
  const after = rows.filter((row) => row.id !== cursor);
  const items = after.slice(0, limit);
  return { items, nextCursor: after.length > limit ? items[items.length - 1].id : null };
}
