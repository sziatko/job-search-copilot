import type { Recommendation } from '../types';

const STYLES: Record<Recommendation, string> = {
  APPLY: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  APPLY_WITH_CAVEATS: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  SKIP: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

const LABELS: Record<Recommendation, string> = {
  APPLY: 'Apply',
  APPLY_WITH_CAVEATS: 'Apply with caveats',
  SKIP: 'Skip',
};

export function RecommendationBadge({ recommendation }: { recommendation: Recommendation }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STYLES[recommendation]}`}
    >
      {LABELS[recommendation]}
    </span>
  );
}
