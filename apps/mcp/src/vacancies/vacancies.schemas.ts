import { MAX_LENGTH, Recommendation, VacancyStatus } from '@job-search-copilot/core';
import { z } from 'zod';
import { matchScore } from '../common/schemas';

// English only, input and filter alike (invariant 4).
export const RecommendationEnum = z.enum(Recommendation);

export const VacancyStatusEnum = z.enum(VacancyStatus);

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
});

export const SubmitAnalysisItemSchema = z.object({
  id: z.number().int().describe("The vacancy's id, from list_vacancies."),
  matchScore,
  recommendation: RecommendationEnum,
  estimationComment,
});
