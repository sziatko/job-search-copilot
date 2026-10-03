// Runtime contract for GET /api/v1/stats — hand-written, not a `core` import
// (ADR-0012; see vacancies/types.ts). Each field is defined in ADR-0031.
import { z } from 'zod';
import { applicationStatusSchema } from '../applications/types';

export const statsSchema = z.object({
  logged: z.number(),
  /** Currently NEW — the analysis queue, with or without posting text. */
  awaitingAnalysis: z.number(),
  awaitingTriage: z.number(),
  recommended: z.number(),
  /** The analyzer's no, each vacancy once: currently FILTERED_OUT, or analysed SKIP. */
  notRecommended: z.number(),
  /** The funnel: vacancies that ever reached the stage (the journal). */
  applied: z.number(),
  /** Currently DECLINED — the user said no. */
  declined: z.number(),
  /** Currently UNAVAILABLE — the posting closed before the user applied. */
  unavailable: z.number(),
  responded: z.number(),
  interview: z.number(),
  /** Currently in RECRUITER_SCREEN. */
  recruiterScreen: z.number(),
  pipeline: z.object({
    byStatus: z.record(applicationStatusSchema, z.number()),
    active: z.number(),
    timedOut: z.number(),
    total: z.number(),
  }),
  /** The latest pipeline moves, newest first. */
  recent: z.array(
    z.object({
      id: z.number(),
      vacancyId: z.number(),
      status: applicationStatusSchema,
      createdAt: z.string(),
      company: z.string(),
      title: z.string(),
    }),
  ),
});
export type Stats = z.infer<typeof statsSchema>;
export type RecentMove = Stats['recent'][number];
