function scoreStyle(score: number): string {
  if (score >= 70) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  if (score >= 50) return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  return 'bg-slate-100 text-slate-600 ring-slate-500/20';
}

export function MatchScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${scoreStyle(score)}`}
    >
      {score}%
    </span>
  );
}
