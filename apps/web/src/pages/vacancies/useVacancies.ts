import {
  keepPreviousData,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { recordApplication } from '../applications/api';
import { isPipelineStatus } from '../applications/types';
import { listVacanciesPage, updateVacancyStatus, type VacancyPage } from './api';
import type { ApplyDetails } from './components/ApplyDialog';
import { RECOMMENDATION_ORDER } from './constants';
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

/** Applied stands for the whole pipeline: a row stays under it as it moves on. */
function matchesStatusFilter(status: VacancyStatus, filter: StatusFilterValue): boolean {
  if (filter === STATUS_FILTER_ALL) return true;
  if (filter === VACANCY_ACTION.APPLIED) return isPipelineStatus(status);
  return status === filter;
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

  // The term is part of the key, not just the request: a different search is a
  // different page of results. Every write below therefore goes through the *prefix*
  // (`{ queryKey: VACANCIES_KEY }`), never one exact key — `findAll` is a partial
  // match, and only a primitive in a key stops `['vacancies','foo']` from matching
  // `['vacancies','foobar']` (terms cannot collide here, so the prefix is safe).
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
  const queryKey = [...VACANCIES_KEY, term] as const;

  const {
    data,
    isPending: loading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => listVacanciesPage({ search: term }),
    // A new term is a new key with no cache entry, so without this the table
    // blanks to "Loading…" on every debounced keystroke.
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const loadError = error ? (error instanceof Error ? error.message : String(error)) : null;

  // Per-row UI bookkeeping. The cache is the source of truth for the data itself;
  // these just track which rows are mid-flight / errored so the table can show it.
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());
  const [pendingDecline, setPendingDecline] = useState<PendingVacancy | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingVacancy | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(VACANCY_ACTION.NOT_REVIEWED);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => matchesStatusFilter(item.status, statusFilter))
      .sort((a, b) => {
        const byRecommendation =
          RECOMMENDATION_ORDER[a.recommendation] - RECOMMENDATION_ORDER[b.recommendation];
        if (byRecommendation !== 0) return byRecommendation;
        return b.matchScore - a.matchScore;
      });
  }, [items, statusFilter]);

  /** Undo a `patchCachedItem` — every key it wrote, back to the snapshot.
   * `setQueryData` ignores `undefined`, so a page that had no data keeps none. */
  function restorePages(previous: [QueryKey, VacancyPage | undefined][] | undefined) {
    for (const [key, data] of previous ?? []) {
      queryClient.setQueryData(key, data);
    }
  }

  /** Optimistic write into **every** cached page, shared by both mutations. */
  function patchCachedItem(id: number, next: VacancyStatus) {
    queryClient.setQueriesData<VacancyPage>({ queryKey: VACANCIES_KEY }, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((item) => (item.id === id ? { ...item, status: next } : item)),
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
      const previous = queryClient.getQueriesData<VacancyPage>({ queryKey: VACANCIES_KEY });
      patchCachedItem(id, status);
      return { previous };
    },
    onError: (err, { id }, context) => {
      restorePages(context?.previous);
      setRowErrors((prev) =>
        new Map(prev).set(id, err instanceof Error ? err.message : 'Failed to save'),
      );
    },
    onSettled: (_data, _err, { id }) => {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: VACANCIES_KEY });
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
      const previous = queryClient.getQueriesData<VacancyPage>({ queryKey: VACANCIES_KEY });
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
    total: data?.total ?? items.length,
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
    cancelDecline: () => setPendingDecline(null),
    cancelApply: () => setPendingApply(null),
  };
}
