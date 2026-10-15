import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Modal } from '@/components/ui/Modal';
import { listApplicationsPage } from '@/pages/applications/api';
import { listVacanciesPage } from '../api';
import { countLine, ModalVacancyTable } from './ModalVacancyTable';

/**
 * Every vacancy of one company with its status — the answer to "have I dealt with
 * these people before?" without leaving the triage screen.
 *
 * Fetched when it opens, not with the table: the list only needs
 * `companyMatchCount` to draw the button, and the modal's rows are a different
 * query (a different scope, and up to 100 of them). `staleTime: 0` on both
 * queries, so every open refetches: neither key is invalidated by the tables'
 * writes, and the app's default 30s kept a status changed a moment ago stale.
 */
export function CompanyHistoryModal({
  company,
  currentId,
  onClose,
}: {
  company: string;
  /** The vacancy whose row opened this — the row to point at once it is listed. */
  currentId: number;
  onClose: () => void;
}) {
  const titleId = useId();

  const { data, isPending, error } = useQuery({
    // Deliberately NOT under ['vacancies']: useVacancies invalidates that prefix
    // after every action change, which would refetch this for nothing.
    queryKey: ['vacancy-company', company],
    queryFn: () => listVacanciesPage({ sameCompanyAs: company, limit: 100 }),
    staleTime: 0,
  });

  // This company's applications, every spelling (ADR-0032), for the ⏳ mark and the
  // CV column. Not under ['applications']: those entries are the tracker's paged
  // lists, and its optimistic writes patch every one of them as pages.
  // One page of 500: a company with more applications loses the oldest marks.
  const applications = useQuery({
    queryKey: ['application-company', company],
    queryFn: () => listApplicationsPage({ sameCompanyAs: company, limit: 500 }),
    staleTime: 0,
  });

  const items = data?.items ?? [];

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidthClassName="max-w-3xl">
      <h2 id={titleId} className="dialog-title">
        All vacancies at {company}
      </h2>
      <p className="dialog-sub">
        {isPending ? 'Loading…' : countLine(items.length, data?.total ?? 0)}
      </p>

      {error ? (
        <div className="empty-state">
          Failed to load this company: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : (
        <ModalVacancyTable
          items={items}
          applications={applications.data?.items}
          loading={isPending}
          currentId={currentId}
        />
      )}

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
