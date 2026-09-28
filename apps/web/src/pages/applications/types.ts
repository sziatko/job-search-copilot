// Runtime contract for /api/v1/applications. Same rules as pages/vacancies/types.ts:
// zod is the single source of truth, TS types are inferred, api.ts parses every
// response through these, and @job-search-copilot/core is NOT imported (Prisma/pg
// must not enter the browser bundle — ADR-0012). Enum values are never written as
// bare literals elsewhere — map over `*.options`.
import { z } from 'zod';
import { type VacancyStatus, vacancyStatusSchema } from '../vacancies/types';

/** The pipeline: the statuses /applications shows. */
export const applicationStatusSchema = vacancyStatusSchema.extract([
  'APPLIED',
  'RECRUITER_SCREEN',
  'REPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export function isPipelineStatus(status: VacancyStatus): status is ApplicationStatus {
  return applicationStatusSchema.safeParse(status).success;
}

// Extra dropdown options — UI only, never cross the wire. ACTIVE and TIMEOUT are
// derived from dates, not stored: see constants.ts for the rule.
export const STATUS_FILTER_ALL = 'ALL' as const;
export const STATUS_FILTER_ACTIVE = 'ACTIVE' as const;
export const STATUS_FILTER_TIMEOUT = 'TIMEOUT' as const;
export type ApplicationStatusFilter =
  | ApplicationStatus
  | typeof STATUS_FILTER_ALL
  | typeof STATUS_FILTER_ACTIVE
  | typeof STATUS_FILTER_TIMEOUT;

const extraFilterValues = [STATUS_FILTER_ALL, STATUS_FILTER_ACTIVE, STATUS_FILTER_TIMEOUT] as const;

export const applicationStatusFilterValues: readonly ApplicationStatusFilter[] = [
  ...extraFilterValues,
  ...applicationStatusSchema.options,
];
/** Same set as a schema, for the router's validateSearch. */
export const applicationStatusFilterSchema = z.enum([
  ...extraFilterValues,
  ...applicationStatusSchema.options,
]);

const commentSourceSchema = z.enum(['ANALYZER', 'USER', 'AGENT']);
export type CommentSource = z.infer<typeof commentSourceSchema>;

const applicationCommentSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  body: z.string(),
  source: commentSourceSchema,
});
export type ApplicationComment = z.infer<typeof applicationCommentSchema>;

/** A vacancy in the pipeline; `id` is the vacancy's. */
export const applicationListItemSchema = z.object({
  id: z.number(),
  status: applicationStatusSchema,
  /** The last status move — the list's order and the timeout clock. */
  statusChangedAt: z.string(),
  /** The latest APPLIED move; null for a row set straight past it. */
  appliedAt: z.string().nullable(),
  /** Every comment on the vacancy, oldest first, the analyzer's included. */
  comments: z.array(applicationCommentSchema),
  salaryInListing: z.string().nullable(),
  usedTailoredResume: z.boolean(),
  company: z.string(),
  title: z.string(),
  applyUrl: z.string(),
  matchScore: z.number(),
});
export type ApplicationListItem = z.infer<typeof applicationListItemSchema>;

export const listApplicationsResponseSchema = z.object({
  items: z.array(applicationListItemSchema),
  total: z.number(),
});

export const recordApplicationResponseSchema = z.object({
  application: applicationListItemSchema,
});
export type RecordApplicationResponse = z.infer<typeof recordApplicationResponseSchema>;

/** PATCH /applications/:id. Absent = untouched; null or blank clears. A non-blank
 * `comment` is added as a new USER comment. */
export interface UpdateApplicationInput {
  salaryInListing?: string | null;
  usedTailoredResume?: boolean;
  comment?: string;
}

export interface RecordApplicationInput {
  vacancyId: number;
  salaryInListing?: string;
  usedTailoredResume?: boolean;
  comment?: string;
}
