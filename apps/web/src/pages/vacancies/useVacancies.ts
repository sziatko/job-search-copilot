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
import { applicationStatusSchema, isPipelineStatus } from '../applications/types';
import { listVacanciesPage, updateVacancyStatus, type VacancyPage } from './api';
import type { ApplyDetails } from './components/ApplyDialog';
import { toastMoved } from './constants';
import {
  STATUS_FILTER_ALL,
  type StatusFilterValue,
  VACANCY_ACTION,
  type VacancyAction,
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
  status: VacancyAction;
}

type CachedPages = InfiniteData<VacancyPage, number | undefined>;

/** The filter as the API's `status` — Applied stands for the whole pipeline, so a row
 * stays under it as it moves on; All sends none. */
function statusesFor(filter: StatusFilterValue): readonly VacancyStatus[] | undefined {
  if (filter === STATUS_FILTER_ALL) return undefined;
  if (filter === VACANCY_ACTION.APPLIED) return applicationStatusSchema.options;
  return [filter];
}

export function useVacancies() {
  const queryClient = useQueryClient();
  const search = useSearch({ from: '/vacancies' });
  const navigate = useNavigate({ from: '/vacancies' });

  // `q` is what the box shows — the raw URL value, padding and all, because the
  // input re-syncs from it and a trimmed value would eat a space as it is typed.
  // `term` is what the server is asked for and what the cache is keyed on, so
  // `" dev "` and `"dev"` are one entry and one request.
  const q = search.q ?? '';
  const term = q.trim();
  const setSearchText = (value: string) => {
    void navigate({
      search: (prev) => ({ ...prev, q: value.trim() === '' ? undefined : value }),
    });
  };
  // In the URL too, NOT_REVIEWED (the triage queue) being the absent value.
  const statusFilter = search.status ?? VACANCY_ACTION.NOT_REVIEWED;
  const setStatusFilter = (value: StatusFilterValue) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        status: value === VACANCY_ACTION.NOT_REVIEWED ? undefined : value,
      }),
    });
  };

  // The term and the filter are part of the key, not just the request: a different
  // search is a different list, which starts again from its first page (ADR-0030). Every write below therefore goes through the *prefix*
  // (`{ queryKey: VACANCIES_KEY }`), never one exact key — `findAll` is a partial
  // match, and only a primitive in a key stops `['vacancies','foo']` from matching
  // `['vacancies','foobar']` (terms cannot collide here, so the prefix is safe).
  // Each entry is an infinite query's `{ pages, pageParams }`, and the write patches
  // every page.
  //
  // The exact-key write this replaced was a silent no-op in both directions (phase
  // 2.2, finding 3): while a new term is in flight its entry does not exist yet, so
  // `setQueryData` returned early and the rollback had no snapshot to restore.
  //
  // It is **not** visible, and the prefix write does not make it visible: while the
  // new query is pending, the rows on screen come from `keepPreviousData`, which
  // freezes the placeholder to the *result* it first produced
  // (`queryObserver.js` — `prevResult.isPlaceholderData` ⇒ `placeholderData =
  // prevResult.data`), so an updated live entry is never re-read. What the prefix
  // write buys is that the optimistic value lands on the entry that exists and the
  // rollback has something to put back — measured, not assumed. Doing it "properly"
  // would mean dropping keepPreviousData, which costs the blank-on-keystroke that
  // phase 2.1, step 2 added it for.
  const queryKey = [...VACANCIES_KEY, term, statusFilter] as const;

  // The server filters and sorts; `useInfiniteList` keeps the previous rows on screen
  // while a new key loads, so the table does not blank on every debounced keystroke.
  const { query, items, total, loadMore } = useInfiniteList(queryKey, (cursor) =>
    listVacanciesPage({
      search: term,
      status: statusesFor(statusFilter),
      sort: 'recommended',
      cursor,
    }),
  );
  const loading = query.isPending;
  const loadError = query.error ? query.error.message : null;

  // Per-row UI bookkeeping. The cache is the source of truth for the data itself;
  // these just track which rows are mid-flight / errored so the table can show it.
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());
  const [pendingDecline, setPendingDecline] = useState<PendingVacancy | null>(null);
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
    mutationFn: ({ id, status }: ActionChange) => updateVacancyStatus(id, status),
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

  function requestActionChange(id: number, status: VacancyAction) {
    const item = items.find((i) => i.id === id);
    // Every status write is an event on the server, so picking the status a row
    // already has must not send one. An applied row's status moves on /applications
    // only (the table disables its controls too).
    if (!item || item.status === status || isPipelineStatus(item.status)) return;
    // Declining/applying are a bit more consequential, so confirm first instead of
    // saving straight away like the other actions.
    if (status === VACANCY_ACTION.DECLINED) {
      setPendingDecline({ id, company: item.company, title: item.title });
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

  // Applying records the application (the dialog's salary / tailored-resume /
  // comment) and moves the vacancy to APPLIED in the same transaction — so this path
  // does not call updateVacancyStatus.
  const applyMutation = useMutation({
    mutationFn: ({ id, details }: { id: number; details: ApplyDetails }) =>
      recordApplication({
        vacancyId: id,
        salaryInListing: details.salary || undefined,
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
    pendingApply,
    q,
    setSearchText,
    statusFilter,
    setStatusFilter,
    requestActionChange,
    confirmDecline,
    confirmApply,
    cancelDecline: () => setPendingDecline(null),
    cancelApply: () => setPendingApply(null),
  };
}
