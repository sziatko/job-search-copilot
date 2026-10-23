import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  listApplicationsPage,
  updateApplication,
  updateApplicationStatus,
} from '@/lib/applications/api';
import {
  type ApplicationListItem,
  type ApplicationStatus,
  type ApplicationStatusFilter,
  STATUS_FILTER_ALL,
  type UpdateApplicationInput,
} from '@/lib/applications/types';
import { queryKeys, staleAfter } from '@/lib/queryKeys';
import { fetchStats } from '@/lib/stats/api';
import { useInfiniteList } from '@/lib/useInfiniteList';
import { useRowMutation } from '@/lib/useRowMutation';
import { toastMoved } from '@/lib/vacancies/constants';

interface StatusChange {
  id: number;
  status: ApplicationStatus;
}

export function useApplications() {
  const search = useSearch({ from: '/_app/applications' });
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
    queryKeys.applications(statusFilter),
    (cursor) => listApplicationsPage({ filter: statusFilter, cursor }),
  );
  const loading = query.isPending;
  const loadError = query.error ? query.error.message : null;

  // The strip counts the whole pipeline on the server (ADR-0031), not the loaded rows —
  // the dashboard's `GET /stats`, under its key.
  const stats = useQuery({ queryKey: queryKeys.stats(), queryFn: fetchStats }).data?.pipeline;

  const { savingIds, rowErrors, rowMutation } = useRowMutation<ApplicationListItem>(
    queryKeys.applications(),
  );

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

  const statusMutation = useMutation(
    rowMutation({
      mutationFn: ({ id, status }: StatusChange) => updateApplicationStatus(id, status),
      // Mirror writeStatus() server-side, or the row keeps its old last-move stamp
      // (and its place) until the refetch lands.
      // A new APPLIED journal row is the new applied date too, and a move restarts
      // the timeout clock.
      patch: (item, { status }) => {
        const now = new Date().toISOString();
        return {
          ...item,
          status,
          statusChangedAt: now,
          timedOut: false,
          appliedAt: status === 'APPLIED' ? now : item.appliedAt,
        };
      },
      invalidates: staleAfter.statusWrite,
    }),
  );

  const editMutation = useMutation(
    rowMutation({
      mutationFn: ({ id, input }: { id: number; input: UpdateApplicationInput }) =>
        updateApplication(id, input),
      // As on the server: absent is untouched, blank clears, and a non-blank comment
      // is appended.
      patch: (item, { input }) => {
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
      invalidates: staleAfter.edit,
    }),
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
