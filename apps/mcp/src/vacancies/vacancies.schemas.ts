import {
  RECOMMENDATION_INPUT_VALUES,
  Recommendation,
  VacancyStatus,
} from '@job-search-copilot/core';
import { z } from 'zod';
import { matchScore } from '../common/schemas';

// Accepts both the canonical English value and its Ukrainian equivalent (what
// the analyzer used to output) — normalized in VacancyService.save().
// Intentionally wider than the Recommendation enum, so it is not derived from it.
const RecommendationInputEnum = z.enum(RECOMMENDATION_INPUT_VALUES);

// Filtering only makes sense against the canonical value already stored in the DB.
export const RecommendationFilterEnum = z.enum(Recommendation);

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
  recommendation: RecommendationInputEnum,
  estimationComment,
});

export const SubmitAnalysisItemSchema = z.object({
  id: z.number().int().describe("The vacancy's id, from list_vacancies."),
  matchScore,
  recommendation: RecommendationInputEnum,
  estimationComment,
});
