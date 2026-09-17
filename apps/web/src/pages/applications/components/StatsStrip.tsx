import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_ORDER, FILTER_LABELS } from '../constants';
import {
  type ApplicationStatus,
  type ApplicationStatusFilter,
  applicationStatusSchema,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  STATUS_FILTER_TIMEOUT,
} from '../types';

// Always show these two; then any other status with a non-zero count.
const ALWAYS: ApplicationStatus[] = ['APPLIED', 'REJECTED'];

export function StatsStrip({
  stats,
  filter,
  onFilterChange,
}: {
  stats: {
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    active: number;
    timedOut: number;
  };
  filter: ApplicationStatusFilter;
  onFilterChange: (filter: ApplicationStatusFilter) => void;
}) {
  const shown = applicationStatusSchema.options
    .filter((s) => ALWAYS.includes(s) || (stats.byStatus[s] ?? 0) > 0)
    .sort((a, b) => APPLICATION_STATUS_ORDER[a] - APPLICATION_STATUS_ORDER[b]);

  // The summary tiles come first, then the raw status breakdown. Every tile is a quick
  // filter: it writes the same URL search param the dropdown does.
  return (
    <div className="mb-6 flex flex-wrap divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
      <Cell
        label="Total"
        value={stats.total}
        selected={filter === STATUS_FILTER_ALL}
        onSelect={() => onFilterChange(STATUS_FILTER_ALL)}
      />
      <Cell
        label={FILTER_LABELS[STATUS_FILTER_ACTIVE]}
        value={stats.active}
        selected={filter === STATUS_FILTER_ACTIVE}
        onSelect={() => onFilterChange(STATUS_FILTER_ACTIVE)}
      />
      <Cell
        label={FILTER_LABELS[STATUS_FILTER_TIMEOUT]}
        value={stats.timedOut}
        valueClassName="text-orange-500"
        selected={filter === STATUS_FILTER_TIMEOUT}
        onSelect={() => onFilterChange(STATUS_FILTER_TIMEOUT)}
      />
      {shown.map((status) => (
        <Cell
          key={status}
          label={APPLICATION_STATUS_LABELS[status]}
          value={stats.byStatus[status] ?? 0}
          selected={filter === status}
          onSelect={() => onFilterChange(status)}
        />
      ))}
    </div>
  );
}

function Cell({
  label,
  value,
  valueClassName = 'text-slate-900',
  selected,
  onSelect,
}: {
  label: string;
  value: number;
  valueClassName?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`px-5 py-3 text-left transition-colors hover:bg-slate-50 ${
        selected ? 'bg-slate-100' : ''
      }`}
    >
      <div className={`text-lg font-semibold ${valueClassName}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </button>
  );
}
