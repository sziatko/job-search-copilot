import { useState } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import { ApplyDialog } from '@/pages/vacancies/components/ApplyDialog';
import { ApplicationStatusFilterSelect } from './components/ApplicationStatusFilterSelect';
import { ApplicationsTable } from './components/ApplicationsTable';
import { CommentDialog } from './components/CommentDialog';
import { TrackerKpis } from './components/TrackerKpis';
import type { ApplicationListItem } from './types';
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
    editApplication,
    addComment,
  } = useApplications();
  const [editing, setEditing] = useState<ApplicationListItem | null>(null);
  const [commenting, setCommenting] = useState<ApplicationListItem | null>(null);

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
            onEdit={setEditing}
            onComment={setCommenting}
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
            comment: editing.userComment ?? '',
          }}
          onCancel={() => setEditing(null)}
          onConfirm={({ salary, usedTailoredResume, comment }) => {
            editApplication(editing.id, {
              salaryInListing: salary,
              usedTailoredResume,
              userComment: comment,
            });
            setEditing(null);
          }}
        />
      )}

      {commenting && (
        <CommentDialog
          company={commenting.company}
          title={commenting.title}
          onCancel={() => setCommenting(null)}
          onConfirm={(body) => {
            addComment(commenting.id, body);
            setCommenting(null);
          }}
        />
      )}
    </section>
  );
}
