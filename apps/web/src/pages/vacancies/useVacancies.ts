import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { recordApplication } from '../applications/api';
import { listEstimatedVacanciesPage, updateUserAction, type VacancyPage } from './api';
import type { ApplyDetails } from './components/ApplyDialog';
import { RECOMMENDATION_ORDER } from './constants';
import { STATUS_FILTER_ALL, type StatusFilterValue, USER_ACTION, type UserAction } from './types';

const VACANCIES_KEY = ['vacancies'] as const;

export interface PendingVacancy {
  id: number;
  company: string;
  title: string;
}

interface ActionChange {
  id: number;
  userAction: UserAction;
}

export function useVacancies() {
  const queryClient = useQueryClient();
  const search = useSearch({ from: '/vacancies' });
  const navigate = useNavigate({ from: '/vacancies' });

  const q = search.q ?? '';
  const setSearchText = (value: string) => {
    void navigate({
      search: (prev) => ({ ...prev, q: value.trim() === '' ? undefined : value }),
    });
  };

  // The term is part of the key, not just the request: a different search is a
  // different page of results, and every exact-key call site below has to agree
  // on that (getQueryData / setQueryData / cancelQueries do not prefix-match — the
  // two `invalidateQueries({ queryKey: VACANCIES_KEY })` calls do, deliberately).
  const queryKey = [...VACANCIES_KEY, q] as const;

  const {
    data,
    isPending: loading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => listEstimatedVacanciesPage({ search: q }),
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
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(USER_ACTION.NOT_REVIEWED);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => statusFilter === STATUS_FILTER_ALL || item.userAction === statusFilter)
      .sort((a, b) => {
        const byRecommendation =
          RECOMMENDATION_ORDER[a.recommendation] - RECOMMENDATION_ORDER[b.recommendation];
        if (byRecommendation !== 0) return byRecommendation;
        return b.matchScore - a.matchScore;
      });
  }, [items, statusFilter]);

  /** Optimistic write into the page-shaped cache, shared by both mutations. */
  function patchCachedItem(id: number, next: UserAction) {
    queryClient.setQueryData<VacancyPage>(queryKey, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((item) => (item.id === id ? { ...item, userAction: next } : item)),
          }
        : old,
    );
  }

  const actionMutation = useMutation({
    mutationFn: ({ id, userAction }: ActionChange) => updateUserAction(id, userAction),
    onMutate: async ({ id, userAction }) => {
      // Don't let an in-flight refetch clobber the optimistic write.
      await queryClient.cancelQueries({ queryKey });
      setSavingIds((prev) => new Set(prev).add(id));
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const previous = queryClient.getQueryData<VacancyPage>(queryKey);
      patchCachedItem(id, userAction);
      return { previous };
    },
    onError: (err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
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

  function requestActionChange(id: number, userAction: UserAction) {
    // Declining/applying are a bit more consequential, so confirm first instead of
    // saving straight away like the other actions.
    if (userAction === USER_ACTION.DECLINED) {
      const item = items.find((i) => i.id === id);
      if (item) setPendingDecline({ id, company: item.company, title: item.title });
      return;
    }
    if (userAction === USER_ACTION.APPLIED) {
      const item = items.find((i) => i.id === id);
      if (item) setPendingApply({ id, company: item.company, title: item.title });
      return;
    }
    actionMutation.mutate({ id, userAction });
  }

  function confirmDecline() {
    if (!pendingDecline) return;
    actionMutation.mutate({ id: pendingDecline.id, userAction: USER_ACTION.DECLINED });
    setPendingDecline(null);
  }

  // Marking a vacancy APPLIED creates an Application (persisting the dialog's
  // salary / tailored-resume / comment) and the server flips userAction to APPLIED
  // in the same transaction — so this path no longer calls updateUserAction.
  const applyMutation = useMutation({
    mutationFn: ({ id, details }: { id: number; details: ApplyDetails }) =>
      recordApplication({
        estimatedVacancyId: id,
        salaryInListing: details.salary || undefined,
        usedTailoredResume: details.usedTailoredResume,
        userComment: details.comment || undefined,
      }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey });
      setSavingIds((prev) => new Set(prev).add(id));
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const previous = queryClient.getQueryData<VacancyPage>(queryKey);
      patchCachedItem(id, USER_ACTION.APPLIED);
      return { previous };
    },
    onError: (err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
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
