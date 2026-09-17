import { RECOMMENDATION_INPUT_VALUES, Recommendation, UserAction } from '@job-search-copilot/core';
import { z } from 'zod';
import { matchScore } from '../common/schemas';

// Accepts both the canonical English value and its Ukrainian equivalent (what
// vacancy-match-analyzer actually outputs) — normalized in EstimatedVacancyService.save().
// Intentionally wider than the Recommendation enum, so it is not derived from it.
export const RecommendationInputEnum = z.enum(RECOMMENDATION_INPUT_VALUES);

// Filtering only makes sense against the canonical value already stored in the DB.
export const RecommendationFilterEnum = z.enum(Recommendation);

export const UserActionEnum = z.enum(UserAction);

export const SaveVacancyItemSchema = z.object({
  company: z.string(),
  title: z.string(),
  applyUrl: z.url(),
  fullText: z.string(),
  matchScore,
  recommendation: RecommendationInputEnum,
  estimationComment: z.string(),
});
