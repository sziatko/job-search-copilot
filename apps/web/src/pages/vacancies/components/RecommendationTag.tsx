import { RECOMMENDATION_TAGS } from '../constants';
import type { Recommendation } from '../types';

export function RecommendationTag({ recommendation }: { recommendation: Recommendation }) {
  const { text, variant } = RECOMMENDATION_TAGS[recommendation];
  return <span className={`tag ${variant}`}>{text}</span>;
}
