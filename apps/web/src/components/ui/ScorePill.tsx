/** Match-score pill. Tier boundaries come from the mockup's `scoreClass`. */
export function ScorePill({ score }: { score: number }) {
  const tier = score >= 70 ? 'score-hi' : score >= 55 ? 'score-mid' : 'score-lo';
  return <span className={`pill ${tier}`}>{score}%</span>;
}
