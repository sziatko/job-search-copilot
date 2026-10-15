import { Recommendation } from '@prisma/client';
import { InvalidRecommendationError } from './errors';

/** A `recommendation` from outside, checked against the enum: English only, exact. MCP
 * and REST validate it first; this keeps a direct core caller from reaching the DB with
 * anything else. */
export function parseRecommendation(input: string): Recommendation {
  if (!Object.hasOwn(Recommendation, input)) {
    throw new InvalidRecommendationError(
      `Unknown recommendation "${input}". Expected one of: ${Object.values(Recommendation).join(', ')}`,
    );
  }
  return input as Recommendation;
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
