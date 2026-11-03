import {
  MAX_LENGTH,
  Recommendation,
  TAGS_PER_VACANCY_MAX,
  VacancyStatus,
} from '@job-search-copilot/core';
import { z } from 'zod';
import { matchScore } from '../common/schemas';

// English only, input and filter alike (invariant 4).
export const RecommendationEnum = z.enum(Recommendation);

export const VacancyStatusEnum = z.enum(VacancyStatus);

/** Tag names in a write. More than a vacancy can hold is refused here, before any query; a
 * name's own rules and the limit counted with the vacancy's tags are core's. */
export const TagNamesSchema = z.array(z.string()).max(TAGS_PER_VACANCY_MAX).optional();

/** What a read tool's description says about the tags it returns. */
export const TAGS_NOTE = '`tags` — [{ id, name, tone }], by name';

const analysisTags = TagNamesSchema.describe(
  'Tags for the vacancy, by name: list_tags first, reuse an existing name; a new name creates ' +
    `a tag. Written with the analysis: a blank name, one over ${MAX_LENGTH.tag} characters or ` +
    `more than ${TAGS_PER_VACANCY_MAX} tags on the vacancy rejects the analysis too.`,
);

const estimationComment = z
  .string()
  .max(MAX_LENGTH.note)
  .describe(
    'The analysis behind the score, stored as the ANALYZER comment. ' +
      "The posting's salary / rate, when it states one, goes here — there is no field " +
      'for it.',
  );

export const SaveVacancyItemSchema = z.object({
  company: z.string().max(MAX_LENGTH.name),
  title: z.string().max(MAX_LENGTH.name),
  applyUrl: z.url().max(MAX_LENGTH.url),
  fullText: z
    .string()
    .max(MAX_LENGTH.fullText)
    .describe('The whole posting text that was analysed, not shortened.'),
  matchScore,
  recommendation: RecommendationEnum,
  estimationComment,
  tags: analysisTags,
});

export const SubmitAnalysisItemSchema = z.object({
  id: z.number().int().describe("The vacancy's id, from list_vacancies."),
  matchScore,
  recommendation: RecommendationEnum,
  estimationComment,
  tags: analysisTags,
});
