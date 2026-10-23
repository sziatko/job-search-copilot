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

/** One status per vacancy: the analysis queue (NEW), triage, FILTERED_OUT (screened out
 * before triage), then the pipeline (APPLIED … REJECTED). */
export const vacancyStatusSchema = z.enum([
  'NEW',
  'NOT_REVIEWED',
  'SAVED_FOR_LATER',
  'DECLINED',
  'UNAVAILABLE',
  'FILTERED_OUT',
  'APPLIED',
  'ACTION_NEEDED',
  'INTERVIEW',
  'AWAITING',
  'OFFER',
  'REJECTED',
]);
export type VacancyStatus = z.infer<typeof vacancyStatusSchema>;

/** Each page's statuses, its **context**: `ALL` in a page's status filter means these,
 * never the whole table. /inbox's tabs split its two; /applications' endpoint is the
 * pipeline itself, so its `ALL` sends no `status`. */
export const STATUS_CONTEXT = {
  inbox: vacancyStatusSchema.extract(['NEW', 'FILTERED_OUT']),
  vacancies: vacancyStatusSchema.extract([
    'NOT_REVIEWED',
    'SAVED_FOR_LATER',
    'DECLINED',
    'UNAVAILABLE',
  ]),
  applications: vacancyStatusSchema.extract([
    'APPLIED',
    'ACTION_NEEDED',
    'INTERVIEW',
    'AWAITING',
    'OFFER',
    'REJECTED',
  ]),
};

/** What a /vacancies row can be moved to: its page's statuses, and APPLIED — which
 * takes it to /applications. The later pipeline stages are /applications'. */
const vacancyActionSchema = vacancyStatusSchema.extract([
  ...STATUS_CONTEXT.vacancies.options,
  'APPLIED',
]);
export type VacancyAction = z.infer<typeof vacancyActionSchema>;
/** Named access to the values, e.g. `VACANCY_ACTION.DECLINED`. */
export const VACANCY_ACTION = vacancyActionSchema.enum;

/** What a row's buttons can move it to: the /vacancies actions, and the inbox's two —
 * Filter out (NEW → FILTERED_OUT) and Back to queue (FILTERED_OUT → NEW, only without
 * an analysis; ADR-0033). */
const rowActionSchema = vacancyStatusSchema.extract([
  ...vacancyActionSchema.options,
  'FILTERED_OUT',
  'NEW',
]);
export type RowAction = z.infer<typeof rowActionSchema>;
/** Named access to the values, e.g. `ROW_ACTION.FILTERED_OUT`. */
export const ROW_ACTION = rowActionSchema.enum;

/** Extra option in the status dropdown — UI only, never sent to the API as itself (it
 * sends the page's context), though it does appear in the page's URL. */
export const STATUS_FILTER_ALL = 'ALL' as const;
/** /vacancies' statuses plus the "all" sentinel, in dropdown order — also the router's
 * `?status=` schema. */
export const statusFilterSchema = z.enum([...STATUS_CONTEXT.vacancies.options, STATUS_FILTER_ALL]);
export type StatusFilterValue = z.infer<typeof statusFilterSchema>;
export const statusFilterValues = statusFilterSchema.options;

export const vacancyListItemSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  company: z.string(),
  title: z.string(),
  applyUrl: z.string(),
  /** Both null when the vacancy has no analysis yet. */
  matchScore: z.number().nullable(),
  recommendation: recommendationSchema.nullable(),
  /** The analyzer's comment; null when it wrote none (a placeholder row). */
  estimationComment: z.string().nullable(),
  status: vacancyStatusSchema,
  /** How many vacancies share this row's company. Derived by the list endpoint
   * (ADR-0025), so it is **optional**: this schema also parses the PATCH
   * .../status response, which returns a plain record with no derived field —
   * requiring it here would fail every action change with "unexpected format". */
  companyMatchCount: z.number().optional(),
  /** Whether the vacancy has an analysis (`recommendation` set) — also derived, so
   * optional for the same reason. Read it as "can a score be shown": `false`
   * and `undefined` both mean no, so consumers must not treat `undefined` as analysed. */
  hasAnalysis: z.boolean().optional(),
  /** Whether the vacancy has posting text — derived too, so optional for the same reason;
   * the PATCH response carries `fullText` itself. */
  hasText: z.boolean().optional(),
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
  /** Null when there is no posting text yet. */
  fullText: z.string().nullable(),
  /** Both null when the vacancy has no analysis yet. */
  matchScore: z.number().nullable(),
  recommendation: recommendationSchema.nullable(),
  status: vacancyStatusSchema,
  statusChangedAt: z.string(),
  salaryInApplication: z.string().nullable(),
  usedTailoredResume: z.boolean(),
  comments: z.array(vacancyCommentSchema),
  /** The analyzer's comment; null on a placeholder that never had one — no score to show. */
  estimationComment: z.string().nullable(),
  timeline: z.array(z.object({ status: vacancyStatusSchema, createdAt: z.string() })),
});
export type VacancyDetail = z.infer<typeof vacancyDetailSchema>;
