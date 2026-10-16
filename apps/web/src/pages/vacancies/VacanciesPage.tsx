import { useState } from 'react';
import { ApplyDialog } from './components/ApplyDialog';
import { CompanyHistoryModal } from './components/CompanyHistoryModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SaveForLaterDialog } from './components/SaveForLaterDialog';
import { SearchModal } from './components/SearchModal';
import { StatusFilterSelect } from './components/StatusFilterSelect';
import { VacancyTable } from './components/VacancyTable';
import { STATUS_CONTEXT } from './types';
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
    <section className="view view-fill">
      <div className="card">
        {/* Same shape as /applications' card: the page title is the shell's, so there
            is no head here and the toolbar carries the top padding. The status
            filter goes to the server, so the count is the server's match count —
            the loaded rows catch up with it as the table scrolls. Gated like the
            /applications': "Showing 0 of 0" during the first load is a claim about the
            data, and there is no data yet. Search is a modal with its own results
            (SearchModal); it never filters this table. */}
        <div className="toolbar">
          {!loadError && !loading && (
            <span className="toolbar-count">
              Showing {items.length} of {total}
            </span>
          )}
          <button type="button" className="btn ml-auto" onClick={() => setSearching(true)}>
            Search
          </button>
          <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        </div>

        {loadError ? (
          <div className="empty-state">Failed to load vacancies: {loadError}</div>
        ) : !loading && items.length === 0 ? (
          <div className="empty-state">No vacancies match this filter.</div>
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
      </div>

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
    </section>
  );
}
