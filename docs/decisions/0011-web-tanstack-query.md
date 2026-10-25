# 0011 — Web data layer: TanStack Query + optimistic mutations

- Status: Accepted · Date: 2026-09

## Context
The web reads lists and single records and changes statuses from row buttons. Doing
that by hand — `useEffect` + `useState`, manual refetch, manual optimistic updates —
makes caching, retry, staleness and rollback our own bug surface.

## Decision
`@tanstack/react-query`:

- one `QueryClient` (`apps/web/src/lib/queryClient.ts`: `staleTime` 30 s, one retry)
  in `main.tsx`;
- the lists are infinite queries over cursor pages (`useInfiniteList`,
  [ADR-0030](0030-cursor-paging.md)), keyed by a prefix plus the filters
  (`['vacancies', …filters]`, `['applications', …]`);
- a status move is a `useMutation` with the standard optimistic pattern: `onMutate`
  cancels in-flight queries, snapshots every cached page under the prefix and writes
  the new value; `onError` restores the snapshot and records the row's error;
  `onSettled` invalidates the list, the single-vacancy query and `['stats']`.
- `useState` keeps what is only UI: the dialogs' targets and the per-row saving state
  and errors.

## Why this and not the alternatives
- **By hand** — every one of caching, refetch, retry and rollback is code we would own.
- **SWR** — comparable, but TanStack's `onMutate` / `onError` / `onSettled` with a
  context fits the optimistic flow better.
- **RTK Query** — a state-management framework for a few lists.

## Consequences
- A failed load retries once; a list revalidates after a write.
- Writes go through the key **prefix**, so they reach the cached page whatever filter
  is on screen. While a new filter's first page loads, `keepPreviousData` shows the
  old page frozen: a write lands in the cache but not on screen until the new page
  arrives.
- Hook tests wrap in a `QueryClientProvider` with `retry: false`.

## What this constrains — breaks if you change it
- A hook using `useQuery` / `useMutation` outside a `QueryClientProvider` → a runtime
  error; every test supplies its own.
- A query key changed in one place but not in the mutations' `setQueriesData` /
  `invalidateQueries` → writes and refetches miss the cached entries; a stale UI.
- `retry: false` dropped from the test wrapper → a mocked failure waits out the backoff.

## Related
[ADR-0012](0012-web-hand-written-contract.md), `apps/web/src/lib/vacancies/useVacancyRows.ts`.
