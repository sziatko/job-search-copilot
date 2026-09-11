import { Link } from '@tanstack/react-router';
import { ApplicationSearchInput } from './components/ApplicationSearchInput';
import { ApplicationStatusFilterSelect } from './components/ApplicationStatusFilterSelect';
import { ApplicationsTable } from './components/ApplicationsTable';
import { StatsStrip } from './components/StatsStrip';
import { useApplications } from './useApplications';

export function ApplicationsPage() {
  const {
    loading,
    loadError,
    items,
    visibleItems,
    stats,
    savingIds,
    rowErrors,
    q,
    setSearchText,
    statusFilter,
    setStatusFilter,
    changeStatus,
  } = useApplications();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-6 py-10">
        <header className="mb-6">
          <Link to="/" className="text-xs text-slate-400 hover:text-indigo-600">
            ← Home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Application tracker</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? 'Loading…' : `${visibleItems.length} of ${items.length} applications`}
          </p>
        </header>

        {!loading && !loadError && <StatsStrip total={stats.total} byStatus={stats.byStatus} />}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ApplicationSearchInput value={q} onChange={setSearchText} />
          <ApplicationStatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        </div>

        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load applications: {loadError}
          </div>
        )}

        {!loading && !loadError && visibleItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
            {items.length === 0
              ? 'No applications recorded yet.'
              : 'No applications match this filter.'}
          </div>
        )}

        {!loading && visibleItems.length > 0 && (
          <ApplicationsTable
            items={visibleItems}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onStatusChange={changeStatus}
          />
        )}
      </div>
    </div>
  );
}
