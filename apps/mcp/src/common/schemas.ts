import { z } from 'zod';

/** Max items accepted by one *_batch call. */
export const BATCH_MAX = 100;

/** Score the analyzer assigns a vacancy, 0-100. Shared by save_* and record_* inputs. */
export const matchScore = z.number().int().min(0).max(100);

/**
 * Cursor paging shared by the two list tools (ADR-0030). They differ only in their
 * ceiling (list_vacancies: 100, list_applications: 500) — pass that in.
 */
export function pagination(maxLimit: number) {
  return {
    limit: z.number().int().min(1).max(maxLimit).optional(),
    cursor: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("The next page: the previous call's `nextCursor`. Absent = the first page."),
  };
}

/** What a list tool's description says about its paging. */
export const PAGING_NOTE =
  'Returns { items, total, nextCursor }: `total` counts every match, `nextCursor` is ' +
  'null on the last page — pass it back as `cursor` for the next one.';
