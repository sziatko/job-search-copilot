import { Link } from '@tanstack/react-router';
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
    <div className="min-h-screen bg-slate-50">
      <div className="px-6 py-10">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Link to="/" className="text-xs text-slate-400 hover:text-indigo-600">
              ← Home
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Analyzed vacancies</h1>
            <p className="mt-1 text-sm text-slate-500">
              {loading ? 'Loading…' : `${visibleItems.length} vacancies`}
            </p>
          </div>
          <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        </header>

        {loadError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load vacancies: {loadError}
          </div>
        )}

        {!loading && !loadError && visibleItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
            No vacancies match this filter.
          </div>
        )}

        {!loading && visibleItems.length > 0 && (
          <VacancyTable
            items={visibleItems}
            savingIds={savingIds}
            rowErrors={rowErrors}
            onActionChange={requestActionChange}
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
    </div>
  );
}
