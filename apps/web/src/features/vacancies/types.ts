// Runtime contract for what GET /api/v1/estimated-vacancies returns. Zod schemas are
// the single source of truth — the TS types are inferred from them, and api.ts parses
// every response through them so a backend shape change fails loudly here instead of
// as a mystery `undefined` deep in the UI. Deliberately NOT importing
// @job-search-copilot/core: that package pulls in Prisma/pg, which has no business in
// a browser bundle.
import { z } from 'zod';

export const recommendationSchema = z.enum(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP']);
export type Recommendation = z.infer<typeof recommendationSchema>;

export const userActionSchema = z.enum(['NOT_REVIEWED', 'READY_TO_APPLY', 'APPLIED', 'DECLINED']);
export type UserAction = z.infer<typeof userActionSchema>;

export type StatusFilterValue = UserAction | 'ALL';

export const estimatedVacancyListItemSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  company: z.string(),
  title: z.string(),
  applyUrl: z.string(),
  matchScore: z.number(),
  recommendation: recommendationSchema,
  estimationComment: z.string(),
  userAction: userActionSchema,
  userActionUpdatedAt: z.string().nullable(),
});
export type EstimatedVacancyListItem = z.infer<typeof estimatedVacancyListItemSchema>;

export const listResponseSchema = z.object({
  items: z.array(estimatedVacancyListItemSchema),
  total: z.number(),
});
