import { ApplicationStatus } from '@job-search-copilot/core';
import { z } from 'zod';
import { matchScore } from '../common/schemas';

export const ApplicationStatusEnum = z.enum(ApplicationStatus);

export const RecordApplicationItemSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  applyUrl: z.url().optional(),
  matchScore: matchScore.optional(),
  estimationComment: z.string().optional(),
  salaryInListing: z.string().optional(),
  usedTailoredResume: z.boolean().optional(),
  userComment: z.string().optional(),
  status: ApplicationStatusEnum.optional(),
});
