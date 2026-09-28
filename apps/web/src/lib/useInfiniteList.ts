import { keepPreviousData, type QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { CursorPage } from './api';

/**
 * A server-paged table (ADR-0030): one `useInfiniteQuery` over cursor pages, the rows
 * flattened, and `loadMore` for `useVirtualRows`' `onEndReached`. The key carries the
 * filters, so a new filter is a new list that starts again from the first page.
 */
export function useInfiniteList<T>(
  queryKey: QueryKey,
  fetchPage: (cursor: number | undefined) => Promise<CursorPage<T>>,
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor,
    // The old rows stay on screen while a new search loads, instead of a blank table.
    placeholderData: keepPreviousData,
  });

  const { data, hasNextPage, isFetching, fetchNextPage } = query;
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  // The newest page's count: the one fetched last covers the most recent writes.
  const total = data?.pages.at(-1)?.total ?? 0;
  const loadMore = () => {
    // One request at a time: a fetch while another runs would race it for the cursor.
    if (hasNextPage && !isFetching) void fetchNextPage();
  };

  return { query, items, total, loadMore };
}
