// Runtime contract for what GET /api/v1/vacancies returns. Zod schemas are
// the single source of truth — the TS types are inferred from them, and api.ts parses
// every response through them so a backend shape change fails loudly here instead of
// as a mystery `undefined` deep in the UI. Deliberately NOT importing
// @job-search-copilot/core: that package pulls in Prisma/pg, which has no business in
// a browser bundle.
//
// Enum values are never written as bare string literals elsewhere — use the
// RECOMMENDATION / VACANCY_ACTION objects, or map over `*.options` / `statusFilterValues`.
// Presentation metadata (labels, sort order) that can't live on a schema is in
// ./constants.
import { z } from 'zod';
import { cursorPageSchema } from '@/lib/api';

export const recommendationSchema = z.enum(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP']);
export type Recommendation = z.infer<typeof recommendationSchema>;
/** Named access to the values, e.g. `RECOMMENDATION.APPLY`. */
export const RECOMMENDATION = recommendationSchema.enum;

/** One status per vacancy: triage, then the pipeline (APPLIED … REJECTED). */
export const vacancyStatusSchema = z.enum([
  'NOT_REVIEWED',
  'SAVED_FOR_LATER',
  'DECLINED',
  'APPLIED',
  'RECRUITER_SCREEN',
  'REPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
]);
export type VacancyStatus = z.infer<typeof vacancyStatusSchema>;

/** What a /vacancies row can be moved to, and what its filter offers — APPLIED
 * standing for the whole pipeline. The later pipeline stages are /applications'. */
const vacancyActionSchema = vacancyStatusSchema.extract([
  'NOT_REVIEWED',
  'SAVED_FOR_LATER',
  'DECLINED',
  'APPLIED',
]);
export type VacancyAction = z.infer<typeof vacancyActionSchema>;
/** Named access to the values, e.g. `VACANCY_ACTION.DECLINED`. */
export const VACANCY_ACTION = vacancyActionSchema.enum;

/** Extra option in the status dropdown — UI only, never sent to the API (it sends no
 * `status`), though it does appear in the page's URL. */
export const STATUS_FILTER_ALL = 'ALL' as const;
/** Every action plus the "all" sentinel, in dropdown order — also the router's
 * `?status=` schema. */
export const statusFilterSchema = z.enum([...vacancyActionSchema.options, STATUS_FILTER_ALL]);
export type StatusFilterValue = z.infer<typeof statusFilterSchema>;
export const statusFilterValues = statusFilterSchema.options;

export const vacancyListItemSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  company: z.string(),
  title: z.string(),
  applyUrl: z.string(),
  matchScore: z.number(),
  recommendation: recommendationSchema,
  /** The analyzer's comment; null when it wrote none (a placeholder row). */
  estimationComment: z.string().nullable(),
  status: vacancyStatusSchema,
  /** How many vacancies share this row's company. Derived by the list endpoint
   * (ADR-0025), so it is **optional**: this schema also parses the PATCH
   * .../status response, which returns a plain record with no derived field —
   * requiring it here would fail every action change with "unexpected format". */
  companyMatchCount: z.number().optional(),
  /** Whether the analyzer ever saw this posting — also derived (same trap, same
   * reason: phase 2.2, step 7). Read it as "can a score be shown": `false` and
   * `undefined` both mean no, so consumers must not treat `undefined` as analysed. */
  hasAnalysis: z.boolean().optional(),
});
export type VacancyListItem = z.infer<typeof vacancyListItemSchema>;

export const vacancyPageSchema = cursorPageSchema(vacancyListItemSchema);

const commentSourceSchema = z.enum(['ANALYZER', 'USER', 'AGENT']);
export type CommentSource = z.infer<typeof commentSourceSchema>;

export const vacancyCommentSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  body: z.string(),
  source: commentSourceSchema,
});
export type VacancyComment = z.infer<typeof vacancyCommentSchema>;

/** GET /vacancies/:id — the whole record: the posting text, every comment and the
 * status journal, each oldest first. */
export const vacancyDetailSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  company: z.string(),
  title: z.string(),
  applyUrl: z.string(),
  fullText: z.string(),
  matchScore: z.number(),
  recommendation: recommendationSchema,
  status: vacancyStatusSchema,
  statusChangedAt: z.string(),
  salaryInListing: z.string().nullable(),
  usedTailoredResume: z.boolean(),
  comments: z.array(vacancyCommentSchema),
  /** The analyzer's comment; null on a placeholder that never had one — no score to show. */
  estimationComment: z.string().nullable(),
  timeline: z.array(z.object({ status: vacancyStatusSchema, createdAt: z.string() })),
});
export type VacancyDetail = z.infer<typeof vacancyDetailSchema>;
