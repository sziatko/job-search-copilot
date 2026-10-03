import { RECOMMENDATION_TAGS } from '../constants';
import type { Recommendation } from '../types';

/** No verdict (not analysed yet) draws `—`. */
export function RecommendationTag({ recommendation }: { recommendation: Recommendation | null }) {
  if (recommendation === null) return '—';
  const { text, variant } = RECOMMENDATION_TAGS[recommendation];
  return <span className={`tag ${variant}`}>{text}</span>;
}
