import { Pill } from './Pill';

/** Match-score pill. Tier boundaries come from the mockup's `scoreClass`. No score (not
 * analysed yet) draws `—`. */
export function ScorePill({ score }: { score: number | null }) {
  if (score === null) return '—';
  return <Pill tone={score >= 70 ? 'good' : score >= 55 ? 'warn' : 'neutral'}>{score}%</Pill>;
}
