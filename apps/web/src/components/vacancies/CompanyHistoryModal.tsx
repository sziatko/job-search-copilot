import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogActions, DialogSub, DialogTitle } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { listApplicationsPage } from '@/lib/applications/api';
import { queryKeys } from '@/lib/queryKeys';
import { listVacanciesPage } from '@/lib/vacancies/api';
import { countLine, ModalVacancyTable } from './ModalVacancyTable';

/**
 * Every vacancy of one company (as core's SAME_COMPANY_STATUSES counts it) with its
 * status — the answer to "have I dealt with these people before?" without leaving the
 * triage screen.
 *
 * Fetched when it opens, not with the table: the list only needs
 * `companyMatchCount` to draw the button, and the modal's rows are a different
 * query (a different scope, and up to 100 of them). `staleTime: 0` on both
 * queries, so every open refetches: the app's own status writes mark them stale
 * (`staleAfter` in `lib/queryKeys.ts`), but a write from elsewhere — the MCP server,
 * another tab — would wait out the app's default staleness.
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
    queryKey: queryKeys.vacancyCompany(company),
    queryFn: () => listVacanciesPage({ sameCompanyAs: company, limit: 100 }),
    staleTime: 0,
  });

  // This company's applications, every spelling (ADR-0032), for the ⏳ mark and the
  // CV column. One page of 500: a company with more applications loses the oldest marks.
  const applications = useQuery({
    queryKey: queryKeys.applicationCompany(company),
    queryFn: () => listApplicationsPage({ sameCompanyAs: company, limit: 500 }),
    staleTime: 0,
  });

  const items = data?.items ?? [];

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidthClassName="max-w-3xl">
      <DialogTitle id={titleId}>All vacancies at {company}</DialogTitle>
      <DialogSub>{isPending ? 'Loading…' : countLine(items.length, data?.total ?? 0)}</DialogSub>

      {error ? (
        <EmptyState>
          Failed to load this company: {error instanceof Error ? error.message : String(error)}
        </EmptyState>
      ) : (
        <ModalVacancyTable
          items={items}
          applications={applications.data?.items}
          loading={isPending}
          currentId={currentId}
        />
      )}

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Modal>
  );
}
