import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_ORDER } from '../constants';
import { type ApplicationStatus, applicationStatusSchema } from '../types';

// Always show these two; then any other status with a non-zero count.
const ALWAYS: ApplicationStatus[] = ['APPLIED', 'REJECTED'];

export function StatsStrip({
  total,
  byStatus,
}: {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
}) {
  const shown = applicationStatusSchema.options
    .filter((s) => ALWAYS.includes(s) || (byStatus[s] ?? 0) > 0)
    .sort((a, b) => APPLICATION_STATUS_ORDER[a] - APPLICATION_STATUS_ORDER[b]);

  return (
    <div className="mb-6 flex flex-wrap divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
      <Cell label="Total" value={total} />
      {shown.map((status) => (
        <Cell
          key={status}
          label={APPLICATION_STATUS_LABELS[status]}
          value={byStatus[status] ?? 0}
        />
      ))}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-3">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
