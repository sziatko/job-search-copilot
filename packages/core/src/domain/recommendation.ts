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

/**
 * Score → verdict, using the same thresholds the web MatchScoreBadge paints with
 * (>=70 green, >=50 amber, else slate). Used when an application is recorded against
 * a vacancy that was never analyzed, so there's no analyzer verdict to store — see
 * ApplicationService.record / ADR-0019.
 */
export function deriveRecommendationFromScore(score: number): Recommendation {
  if (score >= 70) return 'APPLY';
  if (score >= 50) return 'APPLY_WITH_CAVEATS';
  return 'SKIP';
}
