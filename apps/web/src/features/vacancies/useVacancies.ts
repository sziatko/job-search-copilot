import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { listEstimatedVacancies, updateUserAction } from './api';
import { RECOMMENDATION_ORDER } from './constants';
import {
  type EstimatedVacancyListItem,
  STATUS_FILTER_ALL,
  type StatusFilterValue,
  USER_ACTION,
  type UserAction,
} from './types';

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

  const {
    data,
    isPending: loading,
    error,
  } = useQuery({
    queryKey: VACANCIES_KEY,
    queryFn: listEstimatedVacancies,
  });
  const items = useMemo(() => data ?? [], [data]);
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

  const actionMutation = useMutation({
    mutationFn: ({ id, userAction }: ActionChange) => updateUserAction(id, userAction),
    onMutate: async ({ id, userAction }) => {
      // Don't let an in-flight refetch clobber the optimistic write.
      await queryClient.cancelQueries({ queryKey: VACANCIES_KEY });
      setSavingIds((prev) => new Set(prev).add(id));
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const previous = queryClient.getQueryData<EstimatedVacancyListItem[]>(VACANCIES_KEY);
      queryClient.setQueryData<EstimatedVacancyListItem[]>(VACANCIES_KEY, (old) =>
        (old ?? []).map((item) => (item.id === id ? { ...item, userAction } : item)),
      );
      return { previous };
    },
    onError: (err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(VACANCIES_KEY, context.previous);
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

  function confirmApply() {
    if (!pendingApply) return;
    // salary / usedTailoredResume / comment aren't persisted yet — that's a later step.
    actionMutation.mutate({ id: pendingApply.id, userAction: USER_ACTION.APPLIED });
    setPendingApply(null);
  }

  return {
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
    cancelDecline: () => setPendingDecline(null),
    cancelApply: () => setPendingApply(null),
  };
}
