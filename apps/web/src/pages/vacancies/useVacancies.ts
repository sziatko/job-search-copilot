import {
  type InfiniteData,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { useInfiniteList } from '@/lib/useInfiniteList';
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
  type VacancyStatus,
} from './types';

const VACANCIES_KEY = ['vacancies'] as const;

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

type CachedPages = InfiniteData<VacancyPage, number | undefined>;

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
 * behind their dialogs). `filters` are the page's own, keyed under ['vacancies'].
 */
export function useVacancyRows(
  filters: readonly unknown[],
  fetchPage: (cursor: number | undefined) => Promise<VacancyPage>,
) {
  const queryClient = useQueryClient();

  // The filters are part of the key, not just the request: a different
  // filter is a different list, which starts again from its first page (ADR-0030).
  // Every write below therefore goes through the *prefix* (`{ queryKey:
  // VACANCIES_KEY }`), never one exact key — `findAll` is a partial match, so it
  // reaches /vacancies' and /inbox's entries alike.
  // Each entry is an infinite query's `{ pages, pageParams }`, and the write patches
  // every page.
  //
  // The exact-key write this replaced was a silent no-op in both directions (phase
  // 2.2, finding 3): while a new filter is in flight its entry does not exist yet, so
  // `setQueryData` returned early and the rollback had no snapshot to restore.
  //
  // It is **not** visible, and the prefix write does not make it visible: while the
  // new query is pending, the rows on screen come from `keepPreviousData`, which
  // freezes the placeholder to the *result* it first produced
  // (`queryObserver.js` — `prevResult.isPlaceholderData` ⇒ `placeholderData =
  // prevResult.data`), so an updated live entry is never re-read. What the prefix
  // write buys is that the optimistic value lands on the entry that exists and the
  // rollback has something to put back — measured, not assumed. Doing it "properly"
  // would mean dropping keepPreviousData, which costs the blank table on every filter
  // change that phase 2.1, step 2 added it for (then for the toolbar's search box).
  const queryKey = [...VACANCIES_KEY, ...filters];

  // The server filters and sorts; `useInfiniteList` keeps the previous rows on screen
  // while a new key loads, so the table does not blank on a filter change.
  const { query, items, total, loadMore } = useInfiniteList(queryKey, fetchPage);
  const loading = query.isPending;
  const loadError = query.error ? query.error.message : null;

  // Per-row UI bookkeeping. The cache is the source of truth for the data itself;
  // these just track which rows are mid-flight / errored so the table can show it.
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());
  const [pendingDecline, setPendingDecline] = useState<PendingVacancy | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingVacancy | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingVacancy | null>(null);

  /** Undo a `patchCachedItem` — every key it wrote, back to the snapshot.
   * `setQueryData` ignores `undefined`, so a page that had no data keeps none. */
  function restorePages(previous: [QueryKey, CachedPages | undefined][] | undefined) {
    for (const [key, data] of previous ?? []) {
      queryClient.setQueryData(key, data);
    }
  }

  /** Optimistic write into **every** cached page, shared by both mutations. The row
   * keeps its place even when it leaves the filter: the refetch in `onSettled` is what
   * drops it. */
  function patchCachedItem(id: number, next: VacancyStatus) {
    queryClient.setQueriesData<CachedPages>({ queryKey: VACANCIES_KEY }, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === id ? { ...item, status: next } : item)),
            })),
          }
        : old,
    );
  }

  const actionMutation = useMutation({
    mutationFn: ({ id, status, comment }: ActionChange) => updateVacancyStatus(id, status, comment),
    onMutate: async ({ id, status }) => {
      // Don't let an in-flight refetch clobber the optimistic write.
      await queryClient.cancelQueries({ queryKey });
      setSavingIds((prev) => new Set(prev).add(id));
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const previous = queryClient.getQueriesData<CachedPages>({ queryKey: VACANCIES_KEY });
      patchCachedItem(id, status);
      return { previous };
    },
    onError: (err, { id }, context) => {
      restorePages(context?.previous);
      setRowErrors((prev) =>
        new Map(prev).set(id, err instanceof Error ? err.message : 'Failed to save'),
      );
    },
    onSuccess: (item) => toastMoved(item.status, item),
    onSettled: (_data, _err, { id }) => {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: VACANCIES_KEY });
      // The vacancy's own page shows the status too.
      void queryClient.invalidateQueries({ queryKey: ['vacancy'] });
      // Triage moves change the dashboard's counts.
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
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
    mutationFn: ({ id, details }: { id: number; details: ApplyDetails }) =>
      recordApplication({
        vacancyId: id,
        salaryInApplication: details.salary || undefined,
        usedTailoredResume: details.usedTailoredResume,
        comment: details.comment || undefined,
      }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey });
      setSavingIds((prev) => new Set(prev).add(id));
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const previous = queryClient.getQueriesData<CachedPages>({ queryKey: VACANCIES_KEY });
      patchCachedItem(id, VACANCY_ACTION.APPLIED);
      return { previous };
    },
    onError: (err, { id }, context) => {
      restorePages(context?.previous);
      setRowErrors((prev) =>
        new Map(prev).set(id, err instanceof Error ? err.message : 'Failed to save'),
      );
    },
    // Here, not at the call site: the dialog is unmounted the moment it is
    // confirmed, so a `toast.success` next to `mutate()` announced success before
    // the server had answered — and kept announcing it when the answer was 422.
    onSuccess: () => toast.success('Application submitted!'),
    onSettled: (_data, _err, { id }) => {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: VACANCIES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['application-company'] });
      void queryClient.invalidateQueries({ queryKey: ['vacancy'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
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
