import {
  type InfiniteData,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useInfiniteList } from '@/lib/useInfiniteList';
import { fetchStats } from '@/pages/dashboard/api';
import { toastMoved } from '@/pages/vacancies/constants';
import {
  type ApplicationPage,
  listApplicationsPage,
  updateApplication,
  updateApplicationStatus,
} from './api';
import {
  type ApplicationListItem,
  type ApplicationStatus,
  type ApplicationStatusFilter,
  STATUS_FILTER_ALL,
  type UpdateApplicationInput,
} from './types';

const APPLICATIONS_KEY = ['applications'] as const;
/** The dashboard's key: the KPI strip reads the same `GET /stats`. */
const STATS_KEY = ['stats'] as const;

type CachedPages = InfiniteData<ApplicationPage, number | undefined>;

interface StatusChange {
  id: number;
  status: ApplicationStatus;
}

export function useApplications() {
  const queryClient = useQueryClient();
  const search = useSearch({ from: '/applications' });
  const navigate = useNavigate({ from: '/applications' });

  const statusFilter: ApplicationStatusFilter = search.status ?? STATUS_FILTER_ALL;

  const setStatusFilter = (value: ApplicationStatusFilter) => {
    void navigate({
      search: (prev) => ({ ...prev, status: value === STATUS_FILTER_ALL ? undefined : value }),
    });
  };

  // The server filters, counts and pages (ADR-0030); a new filter is a new key, so a
  // new list from its first page. Writes below go through the prefix. Search is the
  // search modal's, never this table's.
  const { query, items, total, loadMore } = useInfiniteList(
    [...APPLICATIONS_KEY, statusFilter],
    (cursor) => listApplicationsPage({ filter: statusFilter, cursor }),
  );
  const loading = query.isPending;
  const loadError = query.error ? query.error.message : null;

  // The strip counts the whole pipeline on the server (ADR-0031), not the loaded rows.
  const stats = useQuery({ queryKey: STATS_KEY, queryFn: fetchStats }).data?.pipeline;

  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());

  // The server's order — the last move first, `id` breaking a tie — kept here so an
  // optimistic move jumps to the top before the refetch lands.
  const visibleItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime() ||
          b.id - a.id,
      ),
    [items],
  );

  /**
   * One optimistic row write: patch the row in every cached page at once, roll them
   * back if the server refuses, show the error under that row, and refetch either
   * way. Status and edit are the same shape; only the request and the patch differ.
   * A row that leaves the filter keeps its place until the refetch drops it.
   */
  function rowMutation<V extends { id: number }>(
    request: (vars: V) => Promise<ApplicationListItem>,
    patch: (item: ApplicationListItem, vars: V) => ApplicationListItem,
  ) {
    return {
      mutationFn: request,
      onMutate: async (vars: V) => {
        await queryClient.cancelQueries({ queryKey: APPLICATIONS_KEY });
        setSavingIds((prev) => new Set(prev).add(vars.id));
        setRowErrors((prev) => {
          const next = new Map(prev);
          next.delete(vars.id);
          return next;
        });
        const previous = queryClient.getQueriesData<CachedPages>({ queryKey: APPLICATIONS_KEY });
        queryClient.setQueriesData<CachedPages>({ queryKey: APPLICATIONS_KEY }, (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) => (item.id === vars.id ? patch(item, vars) : item)),
                })),
              }
            : old,
        );
        return { previous };
      },
      onError: (
        err: Error,
        { id }: V,
        context?: { previous: [QueryKey, CachedPages | undefined][] },
      ) => {
        for (const [key, data] of context?.previous ?? []) {
          queryClient.setQueryData(key, data);
        }
        setRowErrors((prev) => new Map(prev).set(id, err.message || 'Failed to save'));
      },
      onSettled: (_data: unknown, _err: unknown, { id }: V) => {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        void queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY });
        // The strip and the dashboard count these rows.
        void queryClient.invalidateQueries({ queryKey: STATS_KEY });
        // Same rows: /vacancies tags each with its real pipeline status.
        void queryClient.invalidateQueries({ queryKey: ['vacancies'] });
        void queryClient.invalidateQueries({ queryKey: ['vacancy'] });
      },
    };
  }

  const statusMutation = useMutation(
    rowMutation<StatusChange>(
      ({ id, status }) => updateApplicationStatus(id, status),
      // Mirror writeStatus() server-side, or the row keeps its old last-move stamp
      // (and its place) until the refetch lands.
      // A new APPLIED journal row is the new applied date too, and a move restarts
      // the timeout clock.
      (item, { status }) => {
        const now = new Date().toISOString();
        return {
          ...item,
          status,
          statusChangedAt: now,
          timedOut: false,
          appliedAt: status === 'APPLIED' ? now : item.appliedAt,
        };
      },
    ),
  );

  const editMutation = useMutation(
    rowMutation<{ id: number; input: UpdateApplicationInput }>(
      ({ id, input }) => updateApplication(id, input),
      // As on the server: absent is untouched, blank clears, and a non-blank comment
      // is appended.
      (item, { input }) => {
        const text = (value: string | null | undefined, current: string | null) =>
          value === undefined ? current : value?.trim() || null;
        const comment = input.comment?.trim();
        return {
          ...item,
          salaryInApplication: text(input.salaryInApplication, item.salaryInApplication),
          usedTailoredResume: input.usedTailoredResume ?? item.usedTailoredResume,
          comments: comment
            ? [
                ...item.comments,
                // A stand-in until the refetch brings the real row; the negative id
                // cannot collide with a stored one.
                {
                  id: -Date.now(),
                  createdAt: new Date().toISOString(),
                  body: comment,
                  source: 'USER',
                },
              ]
            : item.comments,
        };
      },
    ),
  );

  return {
    loading,
    loadError,
    total,
    loadMore,
    visibleItems,
    stats,
    savingIds,
    rowErrors,
    statusFilter,
    setStatusFilter,
    changeStatus: (id: number, status: ApplicationStatus) =>
      statusMutation.mutate({ id, status }, { onSuccess: (item) => toastMoved(item.status, item) }),
    editApplication: (id: number, input: UpdateApplicationInput) =>
      editMutation.mutate(
        { id, input },
        {
          onSuccess: (item) =>
            toast.success('Application updated', {
              description: `${item.title} — ${item.company}`,
            }),
        },
      ),
  };
}
