import { KpiTile } from '@/components/ui/KpiTile';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_ORDER, FILTER_LABELS } from '../constants';
import {
  type ApplicationStatus,
  type ApplicationStatusFilter,
  applicationStatusSchema,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  STATUS_FILTER_TIMEOUT,
} from '../types';

// Which tiles get a coloured value, mirroring the mockup's tracker tiles.
const KPI_VARIANTS: Partial<Record<ApplicationStatus, 'good' | 'bad'>> = {
  OFFER: 'good',
  INTERVIEW: 'good',
  REJECTED: 'bad',
};

// Always show these two; then any other status with a non-zero count, so an
// empty pipeline doesn't render a row of zeros.
const ALWAYS: ApplicationStatus[] = ['APPLIED', 'REJECTED'];

/**
 * The summary tiles above the /applications table, each one a quick filter that writes
 * the same URL search param the dropdown does.
 *
 * Total / Active / Timeout are ours — the mockup has only the status counts. The
 * derived pair is what the 30-day timeout rule surfaces, so dropping them would
 * hide the only place a stalled application is visible at a glance.
 */
export function ApplicationsKpis({
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
    .filter((status) => ALWAYS.includes(status) || (stats.byStatus[status] ?? 0) > 0)
    .sort((a, b) => APPLICATION_STATUS_ORDER[a] - APPLICATION_STATUS_ORDER[b]);

  return (
    <div className="kpi-row">
      <KpiTile
        label="Total"
        value={stats.total}
        variant="accent"
        selected={filter === STATUS_FILTER_ALL}
        onClick={() => onFilterChange(STATUS_FILTER_ALL)}
      />
      <KpiTile
        label={FILTER_LABELS[STATUS_FILTER_ACTIVE]}
        value={stats.active}
        selected={filter === STATUS_FILTER_ACTIVE}
        onClick={() => onFilterChange(STATUS_FILTER_ACTIVE)}
      />
      <KpiTile
        label={FILTER_LABELS[STATUS_FILTER_TIMEOUT]}
        value={stats.timedOut}
        variant="warn"
        selected={filter === STATUS_FILTER_TIMEOUT}
        onClick={() => onFilterChange(STATUS_FILTER_TIMEOUT)}
      />
      {shown.map((status) => (
        <KpiTile
          key={status}
          label={APPLICATION_STATUS_LABELS[status]}
          value={stats.byStatus[status] ?? 0}
          variant={KPI_VARIANTS[status]}
          selected={filter === status}
          onClick={() => onFilterChange(status)}
        />
      ))}
    </div>
  );
}
