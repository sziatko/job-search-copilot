import { useState } from 'react';
import { ApplyDialog } from '@/pages/vacancies/components/ApplyDialog';
import { CompanyHistoryModal } from '@/pages/vacancies/components/CompanyHistoryModal';
import { SearchModal } from '@/pages/vacancies/components/SearchModal';
import { STATUS_CONTEXT } from '@/pages/vacancies/types';
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
    statusFilter,
    setStatusFilter,
    changeStatus,
    editApplication,
  } = useApplications();
  const [editing, setEditing] = useState<ApplicationListItem | null>(null);
  const [companyHistory, setCompanyHistory] = useState<{
    company: string;
    vacancyId: number;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const emptyMessage =
    statusFilter === STATUS_FILTER_ALL
      ? 'No applications recorded yet.'
      : 'No applications match this filter.';

  return (
    <section className="view view-fill">
      {stats && (
        <ApplicationsKpis stats={stats} filter={statusFilter} onFilterChange={setStatusFilter} />
      )}

      <div className="card">
        <div className="toolbar">
          {!loadError && !loading && (
            <span className="toolbar-count">
              Showing {visibleItems.length} of {total}
            </span>
          )}
          <button type="button" className="btn ml-auto" onClick={() => setSearching(true)}>
            Search
          </button>
          <ApplicationStatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        </div>

        {loadError ? (
          <div className="empty-state">Failed to load applications: {loadError}</div>
        ) : (
          <ApplicationsTable
            loading={loading}
            items={visibleItems}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onStatusChange={changeStatus}
            onEdit={setEditing}
            onShowCompanyHistory={(company, vacancyId) => setCompanyHistory({ company, vacancyId })}
            onEndReached={loadMore}
            emptyMessage={emptyMessage}
          />
        )}
      </div>

      {companyHistory && (
        <CompanyHistoryModal
          company={companyHistory.company}
          currentId={companyHistory.vacancyId}
          onClose={() => setCompanyHistory(null)}
        />
      )}

      {searching && (
        <SearchModal
          context={STATUS_CONTEXT.applications.options}
          onClose={() => setSearching(false)}
        />
      )}

      {editing && (
        <ApplyDialog
          company={editing.company}
          title={editing.title}
          heading="Edit application"
          initial={{
            salary: editing.salaryInApplication ?? '',
            usedTailoredResume: editing.usedTailoredResume,
          }}
          onCancel={() => setEditing(null)}
          onConfirm={({ salary, usedTailoredResume, comment }) => {
            editApplication(editing.id, {
              salaryInApplication: salary,
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
