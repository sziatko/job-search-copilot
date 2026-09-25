import { useState } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import { ApplyDialog } from './components/ApplyDialog';
import { CompanyHistoryModal } from './components/CompanyHistoryModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { StatusFilterSelect } from './components/StatusFilterSelect';
import { VacancyTable } from './components/VacancyTable';
import { useVacancies } from './useVacancies';

export function VacanciesPage() {
  const {
    loading,
    loadError,
    total,
    visibleItems,
    savingIds,
    rowErrors,
    pendingDecline,
    pendingApply,
    q,
    setSearchText,
    statusFilter,
    setStatusFilter,
    requestActionChange,
    confirmDecline,
    confirmApply,
    cancelDecline,
    cancelApply,
  } = useVacancies();

  // Which company's history is open, if any — and which of its rows was clicked,
  // which the modal marks. Page state, not row state: a virtualized row unmounts
  // as soon as it scrolls out of the window.
  const [companyHistory, setCompanyHistory] = useState<{
    company: string;
    vacancyId: number;
  } | null>(null);

  return (
    <section className="view">
      <div className="card">
        {/* Same shape as the tracker's card: the page title is the shell's, so there
            is no head here and the toolbar carries the top padding. The search goes
            to the server, so the count in the foot is the server's match count for
            the term, not a filtered view — `total` and the loaded rows can differ. */}
        <div className="toolbar pt-[16px]">
          <SearchInput value={q} onChange={setSearchText} />
          <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        </div>

        {loadError ? (
          <div className="empty-state">Failed to load vacancies: {loadError}</div>
        ) : loading ? (
          <div className="empty-state">Loading…</div>
        ) : visibleItems.length === 0 ? (
          <div className="empty-state">No vacancies match this filter.</div>
        ) : (
          <VacancyTable
            items={visibleItems}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onActionChange={requestActionChange}
            onShowCompanyHistory={(company, vacancyId) => setCompanyHistory({ company, vacancyId })}
          />
        )}

        {/* Gated like the tracker's: "Showing 0 of 0" during the first load is a
            claim about the data, and there is no data yet. */}
        {!loadError && !loading && (
          <div className="table-foot">
            Showing {visibleItems.length} of {total} vacancies · scores from the vacancy-evaluator
            skill
          </div>
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

      {companyHistory && (
        <CompanyHistoryModal
          company={companyHistory.company}
          currentId={companyHistory.vacancyId}
          onClose={() => setCompanyHistory(null)}
        />
      )}

      {pendingApply && (
        <ApplyDialog
          company={pendingApply.company}
          title={pendingApply.title}
          onCancel={cancelApply}
          // No toast here: the dialog unmounts on confirm, so a success announced
          // from this line was announced before the server answered (phase 2.2,
          // finding 1). The mutation's own `onSuccess` is what reports it.
          onConfirm={confirmApply}
        />
      )}
    </section>
  );
}
