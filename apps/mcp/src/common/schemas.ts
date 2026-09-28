import { z } from 'zod';

/** Max items accepted by one *_batch call. */
export const BATCH_MAX = 100;

/** Score the analyzer assigns a vacancy, 0-100. Shared by save_* and record_* inputs. */
export const matchScore = z.number().int().min(0).max(100);

/**
 * Offset/limit paging shared by the two list tools. They differ only in their
 * ceiling (list_vacancies: 100, list_applications: 500) — pass that in.
 */
export function pagination(maxLimit: number) {
  return {
    limit: z.number().int().min(1).max(maxLimit).optional(),
    offset: z.number().int().min(0).optional(),
  };
}
