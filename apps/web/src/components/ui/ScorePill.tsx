/** Match-score pill. Tier boundaries come from the mockup's `scoreClass`. No score (not
 * analysed yet) draws `—`. */
export function ScorePill({ score }: { score: number | null }) {
  if (score === null) return '—';
  const tier = score >= 70 ? 'score-hi' : score >= 55 ? 'score-mid' : 'score-lo';
  return <span className={`pill ${tier}`}>{score}%</span>;
}
