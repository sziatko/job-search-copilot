import { Tag } from '@/components/ui/Tag';
import { RECOMMENDATION_TAGS } from '@/lib/vacancies/constants';
import type { Recommendation } from '@/lib/vacancies/types';

/** No verdict (not analysed yet) draws `—`. */
export function RecommendationTag({ recommendation }: { recommendation: Recommendation | null }) {
  if (recommendation === null) return '—';
  const { text, tone } = RECOMMENDATION_TAGS[recommendation];
  return <Tag tone={tone}>{text}</Tag>;
}
