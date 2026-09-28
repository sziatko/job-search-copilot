import {
  InvalidApplicationInputError,
  PIPELINE_STATUSES,
  type RecordApplicationInput,
} from '@job-search-copilot/core';
import { z } from 'zod';
import { matchScore } from '../common/schemas';

/** APPLIED … REJECTED: the statuses an application can be recorded or listed in. */
export const PipelineStatusEnum = z.enum(PIPELINE_STATUSES);

export const RecordApplicationItemSchema = z.object({
  vacancyId: z
    .number()
    .int()
    .optional()
    .describe(
      'The vacancy, when you know its id (from list_vacancies / list_applications — e.g. ' +
        'after an ambiguous match). Give this or company + title, not both.',
    ),
  company: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  applyUrl: z.url().optional(),
  matchScore: matchScore.optional(),
  estimationComment: z.string().optional(),
  salaryInListing: z
    .string()
    .optional()
    .describe(
      'What the applicant entered in the application form — not the salary in the ' +
        "posting (that belongs in the analysis's estimationComment).",
    ),
  usedTailoredResume: z
    .boolean()
    .optional()
    .describe('True when the resume was tailored to this posting.'),
  comment: z
    .string()
    .optional()
    .describe(
      "The applicant's own words about this application, added as a USER comment — " +
        "never the analysis or a summary of the posting's requirements.",
    ),
  status: PipelineStatusEnum.optional(),
});

type RecordApplicationItem = z.infer<typeof RecordApplicationItemSchema>;

/** One tool item → the core input: by id, or by (company, title) — exactly one. */
export function toRecordInput({
  vacancyId,
  company,
  title,
  ...rest
}: RecordApplicationItem): RecordApplicationInput {
  if (vacancyId != null && !company && !title) {
    const { salaryInListing, usedTailoredResume, comment, status } = rest;
    return { vacancyId, salaryInListing, usedTailoredResume, comment, status };
  }
  if (vacancyId == null && company && title) {
    return { company, title, ...rest };
  }
  throw new InvalidApplicationInputError(
    'Provide either `vacancyId`, or both `company` and `title`.',
  );
}
