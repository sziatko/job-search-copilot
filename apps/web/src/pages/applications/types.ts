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
  'NO_RESPONSE',
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export const APPLICATION_STATUS = applicationStatusSchema.enum;

/** Extra option in the status dropdown — UI only, never crosses the wire. */
export const STATUS_FILTER_ALL = 'ALL' as const;
export type ApplicationStatusFilter = ApplicationStatus | typeof STATUS_FILTER_ALL;
export const applicationStatusFilterValues: readonly ApplicationStatusFilter[] = [
  ...applicationStatusSchema.options,
  STATUS_FILTER_ALL,
];
/** Same set as a schema, for the router's validateSearch. */
export const applicationStatusFilterSchema = z.enum([
  ...applicationStatusSchema.options,
  STATUS_FILTER_ALL,
]);

// The analyzer's verdict — a third hand-written copy of this enum in the web bundle
// (see the enum touch-point list in the Phase 2 plan / docs/domain-model.md).
const recommendationSchema = z.enum(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP']);

export const applicationListItemSchema = z.object({
  id: z.number(),
  appliedAt: z.string(),
  status: applicationStatusSchema,
  statusUpdatedAt: z.string().nullable(),
  /** Accumulated pipeline notes — see ApplicationService.updateStatus. Written via MCP/API only. */
  statusComment: z.string().nullable(),
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

export interface RecordApplicationInput {
  estimatedVacancyId: number;
  salaryInListing?: string;
  usedTailoredResume?: boolean;
  userComment?: string;
  status?: ApplicationStatus;
}
