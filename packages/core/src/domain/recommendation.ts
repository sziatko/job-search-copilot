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
