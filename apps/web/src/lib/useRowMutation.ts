import {
  type InfiniteData,
  type QueryKey,
  type UseMutationOptions,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';

type Pages<T> = InfiniteData<{ items: T[] }, unknown>;
type Snapshot = { previous: [QueryKey, unknown][] };

/**
 * Optimistic row writes on a server-paged table (ADR-0030). `listKey` is the list's
 * key *prefix*: a different filter is a different entry, and while a new filter's first
 * page loads its exact entry does not exist yet — a write to it would patch nothing and
 * have nothing to roll back. So the cancel, the snapshot, the patch and the rollback all
 * go through the prefix, reaching every cached filter and every page of each.
 *
 * A row keeps its place even when the write moves it out of the filter: the refetch
 * after the write is what drops it.
 */
export function useRowMutation<T extends { id: number }>(listKey: QueryKey) {
  const queryClient = useQueryClient();
  // One key for every write on this list, so the saving set below sees them all.
  const mutationKey = ['row-write', ...listKey];

  // The rows in flight are the pending writes' own variables, so nothing to keep in
  // step by hand.
  const savingIds = new Set(
    useMutationState({
      filters: { mutationKey, status: 'pending' },
      select: (mutation) => (mutation.state.variables as { id: number }).id,
    }),
  );
  // Local state, not derived like `savingIds`: TanStack keeps only the last call's
  // error per mutation, and a table shows one per row.
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());

  /** The options for one kind of row write: its request, how it changes the cached
   * row, and the keys it makes stale (`staleAfter` in `queryKeys.ts`). */
  function rowMutation<V extends { id: number }, R>({
    mutationFn,
    patch,
    invalidates,
  }: {
    mutationFn: (vars: V) => Promise<R>;
    patch: (item: T, vars: V) => T;
    invalidates: readonly QueryKey[];
  }): UseMutationOptions<R, Error, V, Snapshot> {
    return {
      mutationKey,
      mutationFn,
      onMutate: async (vars) => {
        // An in-flight refetch would land on top of the optimistic write.
        await queryClient.cancelQueries({ queryKey: listKey });
        setRowErrors((prev) => {
          const next = new Map(prev);
          next.delete(vars.id);
          return next;
        });
        const previous = queryClient.getQueriesData({ queryKey: listKey });
        queryClient.setQueriesData<Pages<T>>({ queryKey: listKey }, (old) =>
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
      onError: (err, { id }, context) => {
        // `setQueryData` ignores `undefined`, so an entry that had no data keeps none.
        for (const [key, data] of context?.previous ?? []) {
          queryClient.setQueryData(key, data);
        }
        setRowErrors((prev) => new Map(prev).set(id, err.message || 'Failed to save'));
      },
      onSettled: () => {
        for (const queryKey of invalidates) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
    };
  }

  return { savingIds, rowErrors, rowMutation };
}
