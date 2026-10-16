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
 * Score → verdict: >= 70 APPLY, >= 50 APPLY_WITH_CAVEATS, else SKIP. Used when an
 * application is recorded with a score but no verdict, on a vacancy never analysed —
 * see ApplicationService.record / ADR-0019. The web's ScorePill colours at 70 / 55,
 * not 50: the two are not kept in step (ADR-0019).
 */
export function deriveRecommendationFromScore(score: number): Recommendation {
  if (score >= 70) return 'APPLY';
  if (score >= 50) return 'APPLY_WITH_CAVEATS';
  return 'SKIP';
}
