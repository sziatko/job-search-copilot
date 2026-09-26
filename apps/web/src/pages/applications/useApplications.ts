import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  type ApplicationPage,
  addApplicationComment,
  listApplications,
  updateApplication,
  updateApplicationStatus,
} from './api';
import { isActive, isTimedOut, matchesFilter } from './constants';
import {
  type ApplicationListItem,
  type ApplicationStatus,
  type ApplicationStatusFilter,
  STATUS_FILTER_ALL,
  type UpdateApplicationInput,
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
  const items = useMemo(() => data?.items ?? [], [data]);
  const loadError = error ? (error instanceof Error ? error.message : String(error)) : null;

  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());

  const visibleItems = useMemo(() => {
    // Trimmed here, not on write: the URL keeps what was typed (so a trailing
    // space is typeable), the comparison ignores it.
    const needle = q.trim().toLowerCase();
    return items
      .filter((item) => matchesFilter(item, statusFilter))
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
    let active = 0;
    let timedOut = 0;
    for (const item of items) {
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
      if (isTimedOut(item)) timedOut += 1;
      else if (isActive(item)) active += 1;
    }
    return { total: items.length, byStatus, active, timedOut };
  }, [items]);

  /**
   * One optimistic row write: patch the cached row at once, roll the whole page back
   * if the server refuses, show the error under that row, and refetch either way.
   * Status, edit and comment are the same shape; only the request and the patch differ.
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
        const previous = queryClient.getQueryData<ApplicationPage>(APPLICATIONS_KEY);
        queryClient.setQueryData<ApplicationPage>(APPLICATIONS_KEY, (old) =>
          old
            ? {
                ...old,
                items: old.items.map((item) => (item.id === vars.id ? patch(item, vars) : item)),
              }
            : old,
        );
        return { previous };
      },
      onError: (err: Error, { id }: V, context?: { previous?: ApplicationPage }) => {
        if (context?.previous) {
          queryClient.setQueryData(APPLICATIONS_KEY, context.previous);
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
      },
    };
  }

  const statusMutation = useMutation(
    rowMutation<StatusChange>(
      ({ id, status }) => updateApplicationStatus(id, status),
      // Mirror what updateStatus() does server-side, or the row keeps its old
      // last-move stamp until the refetch lands.
      (item, { status }) => ({ ...item, status, statusUpdatedAt: new Date().toISOString() }),
    ),
  );

  const editMutation = useMutation(
    rowMutation<{ id: number; input: UpdateApplicationInput }>(
      ({ id, input }) => updateApplication(id, input),
      // As on the server: absent is untouched, blank clears.
      (item, { input }) => {
        const text = (value: string | null | undefined, current: string | null) =>
          value === undefined ? current : value?.trim() || null;
        return {
          ...item,
          salaryInListing: text(input.salaryInListing, item.salaryInListing),
          usedTailoredResume: input.usedTailoredResume ?? item.usedTailoredResume,
          userComment: text(input.userComment, item.userComment),
        };
      },
    ),
  );

  const commentMutation = useMutation(
    rowMutation<{ id: number; body: string }>(
      ({ id, body }) => addApplicationComment(id, body),
      // A stand-in until the refetch brings the real row; the negative id cannot
      // collide with a stored one.
      (item, { body }) => ({
        ...item,
        comments: [
          ...item.comments,
          { id: -Date.now(), createdAt: new Date().toISOString(), body: body.trim() },
        ],
      }),
    ),
  );

  return {
    loading,
    loadError,
    items,
    total: data?.total ?? items.length,
    visibleItems,
    stats,
    savingIds,
    rowErrors,
    q,
    setSearchText,
    statusFilter,
    setStatusFilter,
    changeStatus: (id: number, status: ApplicationStatus) => statusMutation.mutate({ id, status }),
    editApplication: (id: number, input: UpdateApplicationInput) =>
      editMutation.mutate({ id, input }),
    addComment: (id: number, body: string) => commentMutation.mutate({ id, body }),
  };
}
