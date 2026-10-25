import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListCount, ListFrame } from '@/components/ui/ListFrame';
import { View } from '@/components/ui/View';
import { ApplyDialog } from '@/components/vacancies/ApplyDialog';
import { CompanyHistoryModal } from '@/components/vacancies/CompanyHistoryModal';
import { SearchModal } from '@/components/vacancies/SearchModal';
import { type ApplicationListItem, STATUS_FILTER_ALL } from '@/lib/applications/types';
import { STATUS_CONTEXT } from '@/lib/vacancies/types';
import { ApplicationStatusFilterSelect } from './components/ApplicationStatusFilterSelect';
import { ApplicationsKpis } from './components/ApplicationsKpis';
import { ApplicationsTable } from './components/ApplicationsTable';
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
    <View fill>
      {stats && (
        <ApplicationsKpis stats={stats} filter={statusFilter} onFilterChange={setStatusFilter} />
      )}

      <ListFrame
        toolbar={
          <>
            {!loadError && !loading && <ListCount shown={visibleItems.length} total={total} />}
            <Button className="ml-auto" onClick={() => setSearching(true)}>
              Search
            </Button>
            <ApplicationStatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
          </>
        }
      >
        {loadError ? (
          <EmptyState>Failed to load applications: {loadError}</EmptyState>
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
            filterKey={statusFilter}
            emptyMessage={emptyMessage}
          />
        )}
      </ListFrame>

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
    </View>
  );
}
