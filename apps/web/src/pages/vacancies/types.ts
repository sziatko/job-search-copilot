// Runtime contract for what GET /api/v1/estimated-vacancies returns. Zod schemas are
// the single source of truth — the TS types are inferred from them, and api.ts parses
// every response through them so a backend shape change fails loudly here instead of
// as a mystery `undefined` deep in the UI. Deliberately NOT importing
// @job-search-copilot/core: that package pulls in Prisma/pg, which has no business in
// a browser bundle.
//
// Enum values are never written as bare string literals elsewhere — use the
// RECOMMENDATION / USER_ACTION objects, or map over `*.options` / `statusFilterValues`.
// Presentation metadata (labels, sort order) that can't live on a schema is in
// ./constants.
import { z } from 'zod';

export const recommendationSchema = z.enum(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP']);
export type Recommendation = z.infer<typeof recommendationSchema>;
/** Named access to the values, e.g. `RECOMMENDATION.APPLY`. */
export const RECOMMENDATION = recommendationSchema.enum;

export const userActionSchema = z.enum(['NOT_REVIEWED', 'READY_TO_APPLY', 'APPLIED', 'DECLINED']);
export type UserAction = z.infer<typeof userActionSchema>;
/** Named access to the values, e.g. `USER_ACTION.DECLINED`. */
export const USER_ACTION = userActionSchema.enum;

/** Extra option in the status dropdown — UI only, never crosses the wire. */
export const STATUS_FILTER_ALL = 'ALL' as const;
export type StatusFilterValue = UserAction | typeof STATUS_FILTER_ALL;
/** Every userAction plus the "all" sentinel, in dropdown order. */
export const statusFilterValues: readonly StatusFilterValue[] = [
  ...userActionSchema.options,
  STATUS_FILTER_ALL,
];

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
  /** How many vacancies share this row's company. Derived by the list endpoint
   * (ADR-0025), so it is **optional**: this schema also parses the PATCH
   * .../user-action response, which returns a plain record with no derived field —
   * requiring it here would fail every action change with "unexpected format". */
  companyMatchCount: z.number().optional(),
  /** Whether the analyzer ever saw this posting — also derived (same trap, same
   * reason: phase 2.2, step 7). Read it as "can a score be shown": `false` and
   * `undefined` both mean no, so consumers must not treat `undefined` as analysed. */
  hasAnalysis: z.boolean().optional(),
});
export type EstimatedVacancyListItem = z.infer<typeof estimatedVacancyListItemSchema>;

export const listResponseSchema = z.object({
  items: z.array(estimatedVacancyListItemSchema),
  total: z.number(),
});
