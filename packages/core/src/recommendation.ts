import type { Recommendation } from '@prisma/client';
import { InvalidRecommendationError } from './errors';

/** Accepted spellings for `recommendation` input — the canonical English value plus the
 * Ukrainian wording vacancy-match-analyzer actually outputs. Always stored in DB as English. */
export const RECOMMENDATION_INPUT_VALUES = [
  'APPLY',
  'ПОДАВАТИСЯ',
  'APPLY_WITH_CAVEATS',
  'ПОДАВАТИСЯ З ЗАСТЕРЕЖЕННЯМИ',
  'SKIP',
  'ПРОПУСТИТИ',
] as const;

const RECOMMENDATION_ALIASES: Record<(typeof RECOMMENDATION_INPUT_VALUES)[number], Recommendation> =
  {
    APPLY: 'APPLY',
    ПОДАВАТИСЯ: 'APPLY',
    APPLY_WITH_CAVEATS: 'APPLY_WITH_CAVEATS',
    'ПОДАВАТИСЯ З ЗАСТЕРЕЖЕННЯМИ': 'APPLY_WITH_CAVEATS',
    SKIP: 'SKIP',
    ПРОПУСТИТИ: 'SKIP',
  };

export function normalizeRecommendation(input: string): Recommendation {
  const key = input.trim().toUpperCase() as (typeof RECOMMENDATION_INPUT_VALUES)[number];
  const normalized = RECOMMENDATION_ALIASES[key];
  if (!normalized) {
    throw new InvalidRecommendationError(
      `Unknown recommendation "${input}". Expected one of: ${RECOMMENDATION_INPUT_VALUES.join(', ')}`,
    );
  }
  return normalized;
}
