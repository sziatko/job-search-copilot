import { Recommendation, VacancyStatus } from '@job-search-copilot/core';
import { z } from 'zod';
import { matchScore } from '../common/schemas';

// English only, input and filter alike (invariant 4).
export const RecommendationEnum = z.enum(Recommendation);

export const VacancyStatusEnum = z.enum(VacancyStatus);

const estimationComment = z
  .string()
  .describe(
    'The analysis behind the score, stored as the ANALYZER comment. ' +
      "The posting's salary / rate, when it states one, goes here — there is no field " +
      'for it.',
  );

export const SaveVacancyItemSchema = z.object({
  company: z.string(),
  title: z.string(),
  applyUrl: z.url(),
  fullText: z.string().describe('The whole posting text that was analysed, not shortened.'),
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
