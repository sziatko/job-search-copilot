import { useState } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import { ApplyDialog } from '@/pages/vacancies/components/ApplyDialog';
import { ApplicationStatusFilterSelect } from './components/ApplicationStatusFilterSelect';
import { ApplicationsKpis } from './components/ApplicationsKpis';
import { ApplicationsTable } from './components/ApplicationsTable';
import { type ApplicationListItem, STATUS_FILTER_ALL } from './types';
import { useApplications } from './useApplications';

export function ApplicationsPage() {
  const {
    loading,
    loadError,
    total,
    loadMore,
    visibleItems,
    stats,
    savingIds,
    rowErrors,
    q,
    setSearchText,
    statusFilter,
    setStatusFilter,
    changeStatus,
    editApplication,
  } = useApplications();
  const [editing, setEditing] = useState<ApplicationListItem | null>(null);

  const emptyMessage =
    q.trim() === '' && statusFilter === STATUS_FILTER_ALL
      ? 'No applications recorded yet.'
      : 'No applications match this filter.';

  return (
    <section className="view">
      {stats && (
        <ApplicationsKpis stats={stats} filter={statusFilter} onFilterChange={setStatusFilter} />
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
            onEdit={setEditing}
            onEndReached={loadMore}
            emptyMessage={emptyMessage}
          />
        )}

        {!loadError && !loading && (
          <div className="table-foot">
            Showing {visibleItems.length} of {total} applications
          </div>
        )}
      </div>

      {editing && (
        <ApplyDialog
          company={editing.company}
          title={editing.title}
          heading="Edit application"
          initial={{
            salary: editing.salaryInListing ?? '',
            usedTailoredResume: editing.usedTailoredResume,
          }}
          onCancel={() => setEditing(null)}
          onConfirm={({ salary, usedTailoredResume, comment }) => {
            editApplication(editing.id, {
              salaryInListing: salary,
              usedTailoredResume,
              comment,
            });
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
