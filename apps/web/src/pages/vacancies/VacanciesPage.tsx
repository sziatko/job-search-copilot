import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListCount, ListFrame } from '@/components/ui/ListFrame';
import { View } from '@/components/ui/View';
import { ApplyDialog } from '@/components/vacancies/ApplyDialog';
import { CompanyHistoryModal } from '@/components/vacancies/CompanyHistoryModal';
import { ConfirmDialog } from '@/components/vacancies/ConfirmDialog';
import { SaveForLaterDialog } from '@/components/vacancies/SaveForLaterDialog';
import { SearchModal } from '@/components/vacancies/SearchModal';
import { VacancyTable } from '@/components/vacancies/VacancyTable';
import { STATUS_CONTEXT } from '@/lib/vacancies/types';
import { StatusFilterSelect } from './components/StatusFilterSelect';
import { useVacancies } from './useVacancies';

export function VacanciesPage() {
  const {
    loading,
    loadError,
    total,
    items,
    loadMore,
    savingIds,
    rowErrors,
    pendingDecline,
    pendingSave,
    pendingApply,
    statusFilter,
    setStatusFilter,
    requestActionChange,
    confirmDecline,
    confirmSave,
    confirmApply,
    cancelDecline,
    cancelSave,
    cancelApply,
  } = useVacancies();

  // Which company's history is open, if any — and which of its rows was clicked,
  // which the modal marks. Page state, not row state: a virtualized row unmounts
  // as soon as it scrolls out of the window.
  const [companyHistory, setCompanyHistory] = useState<{
    company: string;
    vacancyId: number;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  return (
    <View fill>
      {/* The status filter goes to the server, so the count is the server's match count.
          Gated: "Showing 0 of 0" during the first load is a claim about the data, and
          there is no data yet. Search is a modal with its own results (SearchModal); it
          never filters this table. */}
      <ListFrame
        toolbar={
          <>
            {!loadError && !loading && <ListCount shown={items.length} total={total} />}
            <Button className="ml-auto" onClick={() => setSearching(true)}>
              Search
            </Button>
            <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
          </>
        }
      >
        {loadError ? (
          <EmptyState>Failed to load vacancies: {loadError}</EmptyState>
        ) : !loading && items.length === 0 ? (
          <EmptyState>No vacancies match this filter.</EmptyState>
        ) : (
          <VacancyTable
            loading={loading}
            items={items}
            onEndReached={loadMore}
            filterKey={statusFilter}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onActionChange={requestActionChange}
            onShowCompanyHistory={(company, vacancyId) => setCompanyHistory({ company, vacancyId })}
          />
        )}
      </ListFrame>

      {pendingDecline && (
        <ConfirmDialog
          title="Decline this vacancy?"
          description={`${pendingDecline.title} — ${pendingDecline.company}. This vacancy will disappear from the list.`}
          confirmLabel="Yes, decline"
          onCancel={cancelDecline}
          onConfirm={confirmDecline}
        />
      )}

      {pendingSave && (
        <SaveForLaterDialog
          company={pendingSave.company}
          title={pendingSave.title}
          onCancel={cancelSave}
          onConfirm={confirmSave}
        />
      )}

      {companyHistory && (
        <CompanyHistoryModal
          company={companyHistory.company}
          currentId={companyHistory.vacancyId}
          onClose={() => setCompanyHistory(null)}
        />
      )}

      {searching && (
        <SearchModal
          context={STATUS_CONTEXT.vacancies.options}
          onClose={() => setSearching(false)}
        />
      )}

      {pendingApply && (
        <ApplyDialog
          company={pendingApply.company}
          title={pendingApply.title}
          onCancel={cancelApply}
          // No toast here: the dialog unmounts on confirm, so a success announced from
          // this line would come before the server answered. The mutation's
          // `onSuccess` reports it.
          onConfirm={confirmApply}
        />
      )}
    </View>
  );
}
