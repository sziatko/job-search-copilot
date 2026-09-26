// Runtime contract for /api/v1/applications. Same rules as features/vacancies/types.ts:
// zod is the single source of truth, TS types are inferred, api.ts parses every
// response through these, and @job-search-copilot/core is NOT imported (Prisma/pg
// must not enter the browser bundle — ADR-0012). Enum values are never written as
// bare literals elsewhere — use APPLICATION_STATUS or map over `*.options`.
import { z } from 'zod';

export const applicationStatusSchema = z.enum([
  'APPLIED',
  'RECRUITER_SCREEN',
  'REPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export const APPLICATION_STATUS = applicationStatusSchema.enum;

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

// The analyzer's verdict — a third hand-written copy of this enum in the web bundle
// (see the enum touch-point list in the Phase 2 plan / docs/domain-model.md).
const recommendationSchema = z.enum(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP']);

const applicationCommentSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  body: z.string(),
});
export type ApplicationComment = z.infer<typeof applicationCommentSchema>;

export const applicationListItemSchema = z.object({
  id: z.number(),
  appliedAt: z.string(),
  status: applicationStatusSchema,
  statusUpdatedAt: z.string(),
  /** The append-only timeline, oldest first (ADR-0028). */
  comments: z.array(applicationCommentSchema),
  salaryInListing: z.string().nullable(),
  usedTailoredResume: z.boolean(),
  userComment: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  estimatedVacancyId: z.number(),
  company: z.string(),
  title: z.string(),
  applyUrl: z.string(),
  matchScore: z.number(),
  recommendation: recommendationSchema,
  estimationComment: z.string(),
});
export type ApplicationListItem = z.infer<typeof applicationListItemSchema>;

export const listApplicationsResponseSchema = z.object({
  items: z.array(applicationListItemSchema),
  total: z.number(),
});

export const recordApplicationResponseSchema = z.object({
  application: applicationListItemSchema,
  resolution: z.enum(['linked-by-id', 'linked-existing', 'created-vacancy']),
  vacancyCreated: z.boolean(),
});
export type RecordApplicationResponse = z.infer<typeof recordApplicationResponseSchema>;

/** PATCH /applications/:id. Absent = untouched; null or blank clears. */
export interface UpdateApplicationInput {
  salaryInListing?: string | null;
  usedTailoredResume?: boolean;
  userComment?: string | null;
}

export interface RecordApplicationInput {
  estimatedVacancyId: number;
  salaryInListing?: string;
  usedTailoredResume?: boolean;
  userComment?: string;
  status?: ApplicationStatus;
}
