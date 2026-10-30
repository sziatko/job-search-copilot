// Runtime contract for /api/v1/applications. Same rules as ../vacancies/types.ts:
// zod is the single source of truth, TS types are inferred, api.ts parses every
// response through these, and @job-search-copilot/core is NOT imported (Prisma/pg
// must not enter the browser bundle — ADR-0012). Enum values are never written as
// bare literals elsewhere — map over `*.options`.
import { z } from 'zod';
import { cursorPageSchema } from '@/lib/api';
import {
  STATUS_CONTEXT,
  type VacancyComment,
  type VacancyStatus,
  vacancyCommentSchema,
} from '@/lib/vacancies/types';

/** The pipeline: the statuses /applications shows — its context. */
export const applicationStatusSchema = STATUS_CONTEXT.applications;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export function isPipelineStatus(status: VacancyStatus): status is ApplicationStatus {
  return applicationStatusSchema.safeParse(status).success;
}

// Extra dropdown options — UI only, never sent as a `status`. ACTIVE and TIMEOUT are
// derived from dates, not stored: the server owns the rule, and api.ts sends them as
// `state` (ADR-0031).
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

// One comment schema for both views of a vacancy — it lives with the vacancy's (this
// file imports that one, never the reverse).
const applicationCommentSchema = vacancyCommentSchema;

export type { CommentSource } from '@/lib/vacancies/types';
export type ApplicationComment = VacancyComment;

/** A vacancy in the pipeline; `id` is the vacancy's. */
export const applicationListItemSchema = z.object({
  id: z.number(),
  status: applicationStatusSchema,
  /** The last status move — the list's order and the timeout clock. */
  statusChangedAt: z.string(),
  /** The server's timeout rule (ADR-0031) — open and not moved for 30 days. */
  timedOut: z.boolean(),
  /** The latest APPLIED move; null for a row set straight past it. */
  appliedAt: z.string().nullable(),
  /** Every comment on the vacancy, oldest first, the analyzer's included. */
  comments: z.array(applicationCommentSchema),
  salaryInApplication: z.string().nullable(),
  usedTailoredResume: z.boolean(),
  company: z.string(),
  title: z.string(),
  applyUrl: z.string(),
  /** Null when the vacancy has no analysis (a row record_application created). */
  matchScore: z.number().nullable(),
  /** How many vacancies (core's SAME_COMPANY_STATUSES) share this row's company —
   * derived by the list endpoint only, so optional: the PATCH / POST responses parse through this schema
   * too and carry none (the /vacancies schema's trap, ADR-0025). */
  companyMatchCount: z.number().optional(),
});
export type ApplicationListItem = z.infer<typeof applicationListItemSchema>;

export const applicationPageSchema = cursorPageSchema(applicationListItemSchema);

export const recordApplicationResponseSchema = z.object({
  application: applicationListItemSchema,
});
export type RecordApplicationResponse = z.infer<typeof recordApplicationResponseSchema>;

/** PATCH /applications/:id. Absent = untouched; null or blank clears. A non-blank
 * `comment` is added as a new USER comment. */
export interface UpdateApplicationInput {
  salaryInApplication?: string | null;
  usedTailoredResume?: boolean;
  comment?: string;
}

export interface RecordApplicationInput {
  vacancyId: number;
  salaryInApplication?: string;
  usedTailoredResume?: boolean;
  comment?: string;
}

/** What the apply dialog collects, as typed: a blank field is an empty string. */
export interface ApplyDetails {
  salary: string;
  usedTailoredResume: boolean;
  comment: string;
}
