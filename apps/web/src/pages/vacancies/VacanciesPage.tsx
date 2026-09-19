import { toast } from 'sonner';
import { ApplyDialog } from './components/ApplyDialog';
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
    statusFilter,
    setStatusFilter,
    requestActionChange,
    confirmDecline,
    confirmApply,
    cancelDecline,
    cancelApply,
  } = useVacancies();

  return (
    <section className="view">
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Analyzed vacancies</h2>
            <div className="count">
              {loading ? 'Loading…' : `${visibleItems.length} of ${total} vacancies`}
            </div>
          </div>
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
          />
        )}

        <div className="table-foot">Scroll for more · scores from the vacancy-evaluator skill</div>
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

      {pendingApply && (
        <ApplyDialog
          company={pendingApply.company}
          title={pendingApply.title}
          onCancel={cancelApply}
          onConfirm={(details) => {
            confirmApply(details);
            toast.success('Application submitted!');
          }}
        />
      )}
    </section>
  );
}
