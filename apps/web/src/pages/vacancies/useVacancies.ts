import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { queryKeys, staleAfter } from '@/lib/queryKeys';
import { useInfiniteList } from '@/lib/useInfiniteList';
import { useRowMutation } from '@/lib/useRowMutation';
import { recordApplication } from '../applications/api';
import { isPipelineStatus } from '../applications/types';
import { listVacanciesPage, updateVacancyStatus, type VacancyPage } from './api';
import type { ApplyDetails } from './components/ApplyDialog';
import { toastMoved } from './constants';
import {
  type RowAction,
  STATUS_CONTEXT,
  STATUS_FILTER_ALL,
  type StatusFilterValue,
  VACANCY_ACTION,
  type VacancyListItem,
  type VacancyStatus,
} from './types';

interface PendingVacancy {
  id: number;
  company: string;
  title: string;
}

interface ActionChange {
  id: number;
  status: RowAction;
  comment?: string;
}

/** The filter as the API's `status` — All is the page's own statuses, never the whole
 * table: NEW / FILTERED_OUT are /inbox's, the pipeline /applications'. */
function statusesFor(filter: StatusFilterValue): readonly VacancyStatus[] {
  return filter === STATUS_FILTER_ALL ? STATUS_CONTEXT.vacancies.options : [filter];
}

/** /vacancies: the status filter, in the URL, over the shared vacancy rows. Search is
 * the search modal's, never this table's. */
export function useVacancies() {
  const search = useSearch({ from: '/_app/vacancies' });
  const navigate = useNavigate({ from: '/vacancies' });

  // NOT_REVIEWED (the triage queue) is the absent value.
  const statusFilter = search.status ?? VACANCY_ACTION.NOT_REVIEWED;
  const setStatusFilter = (value: StatusFilterValue) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        status: value === VACANCY_ACTION.NOT_REVIEWED ? undefined : value,
      }),
    });
  };

  const rows = useVacancyRows([statusFilter], (cursor) =>
    listVacanciesPage({ status: statusesFor(statusFilter), sort: 'recommended', cursor }),
  );

  return { ...rows, statusFilter, setStatusFilter };
}

/**
 * A table of vacancy rows — /vacancies' and /inbox's: the server's list, paged, and the
 * row writes (a status move, optimistic and toasted; Decline, Save for later and Apply
 * behind their dialogs). `filters` are the page's own, keyed under `queryKeys.vacancies`.
 */
export function useVacancyRows(
  filters: readonly unknown[],
  fetchPage: (cursor: number | undefined) => Promise<VacancyPage>,
) {
  // The filters are part of the key, so a different filter is a different list. The
  // writes go through the prefix (see `useRowMutation`), which reaches /vacancies' and
  // /inbox's entries alike.
  //
  // Not visible while a new filter's page loads: `keepPreviousData` shows the old result
  // frozen, so a write lands in the cache, not on screen, until the new page arrives.
  const { savingIds, rowErrors, rowMutation } = useRowMutation<VacancyListItem>(
    queryKeys.vacancies(),
  );

  // The server filters and sorts; `useInfiniteList` keeps the previous rows on screen
  // while a new key loads, so the table does not blank on a filter change.
  const { query, items, total, loadMore } = useInfiniteList(
    queryKeys.vacancies(...filters),
    fetchPage,
  );
  const loading = query.isPending;
  const loadError = query.error ? query.error.message : null;

  const [pendingDecline, setPendingDecline] = useState<PendingVacancy | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingVacancy | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingVacancy | null>(null);

  const actionMutation = useMutation({
    ...rowMutation({
      mutationFn: ({ id, status, comment }: ActionChange) =>
        updateVacancyStatus(id, status, comment),
      patch: (item, { status }) => ({ ...item, status }),
      invalidates: staleAfter.statusWrite,
    }),
    onSuccess: (item) => toastMoved(item.status, item),
  });

  function requestActionChange(id: number, status: RowAction) {
    const item = items.find((i) => i.id === id);
    // Every status write is an event on the server, so picking the status a row
    // already has must not send one. An applied row's status moves on /applications
    // only (the table disables its controls too).
    if (!item || item.status === status || isPipelineStatus(item.status)) return;
    // Declining/applying are a bit more consequential, so confirm first instead of
    // saving straight away like the other actions; saving for later asks why.
    if (status === VACANCY_ACTION.DECLINED) {
      setPendingDecline({ id, company: item.company, title: item.title });
      return;
    }
    if (status === VACANCY_ACTION.SAVED_FOR_LATER) {
      setPendingSave({ id, company: item.company, title: item.title });
      return;
    }
    if (status === VACANCY_ACTION.APPLIED) {
      setPendingApply({ id, company: item.company, title: item.title });
      return;
    }
    actionMutation.mutate({ id, status });
  }

  function confirmDecline() {
    if (!pendingDecline) return;
    actionMutation.mutate({ id: pendingDecline.id, status: VACANCY_ACTION.DECLINED });
    setPendingDecline(null);
  }

  function confirmSave(comment: string | undefined) {
    if (!pendingSave) return;
    actionMutation.mutate({ id: pendingSave.id, status: VACANCY_ACTION.SAVED_FOR_LATER, comment });
    setPendingSave(null);
  }

  // Applying records the application (the dialog's salary / tailored-resume /
  // comment) and moves the vacancy to APPLIED in the same transaction — so this path
  // does not call updateVacancyStatus.
  const applyMutation = useMutation({
    ...rowMutation({
      mutationFn: ({ id, details }: { id: number; details: ApplyDetails }) =>
        recordApplication({
          vacancyId: id,
          salaryInApplication: details.salary || undefined,
          usedTailoredResume: details.usedTailoredResume,
          comment: details.comment || undefined,
        }),
      patch: (item) => ({ ...item, status: VACANCY_ACTION.APPLIED }),
      invalidates: staleAfter.statusWrite,
    }),
    // Here, not at the call site: the dialog unmounts the moment it is confirmed, so a
    // `toast.success` next to `mutate()` would announce success before the server
    // answered — even when the answer is a 422.
    onSuccess: () => toast.success('Application submitted!'),
  });

  function confirmApply(details: ApplyDetails) {
    if (!pendingApply) return;
    applyMutation.mutate({ id: pendingApply.id, details });
    setPendingApply(null);
  }

  return {
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
    requestActionChange,
    confirmDecline,
    confirmSave,
    confirmApply,
    cancelDecline: () => setPendingDecline(null),
    cancelSave: () => setPendingSave(null),
    cancelApply: () => setPendingApply(null),
  };
}
