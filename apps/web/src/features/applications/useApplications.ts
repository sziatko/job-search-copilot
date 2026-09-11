import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { listApplications, updateApplicationStatus } from './api';
import {
  type ApplicationListItem,
  type ApplicationStatus,
  type ApplicationStatusFilter,
  STATUS_FILTER_ALL,
} from './types';

const APPLICATIONS_KEY = ['applications'] as const;

interface StatusChange {
  id: number;
  status: ApplicationStatus;
}

export function useApplications() {
  const queryClient = useQueryClient();
  const search = useSearch({ from: '/tracker' });
  const navigate = useNavigate({ from: '/tracker' });

  const q = search.q ?? '';
  const statusFilter: ApplicationStatusFilter = search.status ?? STATUS_FILTER_ALL;

  const setSearchText = (value: string) => {
    void navigate({
      search: (prev) => ({ ...prev, q: value.trim() === '' ? undefined : value }),
    });
  };
  const setStatusFilter = (value: ApplicationStatusFilter) => {
    void navigate({
      search: (prev) => ({ ...prev, status: value === STATUS_FILTER_ALL ? undefined : value }),
    });
  };

  const {
    data,
    isPending: loading,
    error,
  } = useQuery({ queryKey: APPLICATIONS_KEY, queryFn: listApplications });
  const items = useMemo(() => data ?? [], [data]);
  const loadError = error ? (error instanceof Error ? error.message : String(error)) : null;

  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());

  const visibleItems = useMemo(() => {
    const needle = q.toLowerCase();
    return items
      .filter((item) => statusFilter === STATUS_FILTER_ALL || item.status === statusFilter)
      .filter(
        (item) =>
          needle === '' ||
          item.company.toLowerCase().includes(needle) ||
          item.title.toLowerCase().includes(needle),
      )
      .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
  }, [items, q, statusFilter]);

  // Counts over the WHOLE log, not the filtered view — the strip is an overview.
  const stats = useMemo(() => {
    const byStatus = {} as Record<ApplicationStatus, number>;
    for (const item of items) {
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    }
    return { total: items.length, byStatus };
  }, [items]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: StatusChange) => updateApplicationStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: APPLICATIONS_KEY });
      setSavingIds((prev) => new Set(prev).add(id));
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const previous = queryClient.getQueryData<ApplicationListItem[]>(APPLICATIONS_KEY);
      queryClient.setQueryData<ApplicationListItem[]>(APPLICATIONS_KEY, (old) =>
        (old ?? []).map((item) => (item.id === id ? { ...item, status } : item)),
      );
      return { previous };
    },
    onError: (err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(APPLICATIONS_KEY, context.previous);
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
      void queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY });
    },
  });

  return {
    loading,
    loadError,
    items,
    visibleItems,
    stats,
    savingIds,
    rowErrors,
    q,
    setSearchText,
    statusFilter,
    setStatusFilter,
    changeStatus: (id: number, status: ApplicationStatus) => statusMutation.mutate({ id, status }),
  };
}
