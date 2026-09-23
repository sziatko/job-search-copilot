import { SearchInput } from '@/components/ui/SearchInput';
import { ApplicationStatusFilterSelect } from './components/ApplicationStatusFilterSelect';
import { ApplicationsTable } from './components/ApplicationsTable';
import { TrackerKpis } from './components/TrackerKpis';
import { useApplications } from './useApplications';

export function ApplicationsPage() {
  const {
    loading,
    loadError,
    items,
    total,
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

  const emptyMessage =
    items.length === 0 ? 'No applications recorded yet.' : 'No applications match this filter.';

  return (
    <section className="view">
      {!loading && !loadError && (
        <TrackerKpis stats={stats} filter={statusFilter} onFilterChange={setStatusFilter} />
      )}

      <div className="card">
        <div className="toolbar pt-[16px]">
          <SearchInput value={q} onChange={setSearchText} />
          <ApplicationStatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        </div>

        {loadError ? (
          <div className="empty-state">Failed to load applications: {loadError}</div>
        ) : loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <ApplicationsTable
            items={visibleItems}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onStatusChange={changeStatus}
            emptyMessage={emptyMessage}
          />
        )}

        {!loadError && !loading && (
          <div className="table-foot">
            Showing {visibleItems.length} of {total} applications
          </div>
        )}
      </div>
    </section>
  );
}
