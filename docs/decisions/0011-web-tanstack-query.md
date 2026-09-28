# 0011 — Web data layer: TanStack Query + optimistic mutation

- Status: Accepted
- Phase: 1 · Date: 2026-09

## Context
`useVacancies` was hand-rolled: `useEffect` + `useState` for `items` / `loading` /
`loadError`, plus manual `Set`/`Map` bookkeeping for per-row saving state and
errors, plus a manual optimistic `setItems`. No refetch, no revalidation, a failed
load never retried.

## Decision
Adopt `@tanstack/react-query`:

- `QueryClientProvider` in `main.tsx` with one `queryClient`
  (`apps/web/src/lib/queryClient.ts`, `staleTime: 30s`, `retry: 1`).
- `useVacancies` uses `useQuery({ queryKey: ['vacancies'], queryFn:
  listVacancies })` for the list, and `useMutation` for
  `updateVacancyStatus` with the canonical optimistic pattern: `onMutate` cancels
  in-flight queries, snapshots, and writes the optimistic cache update; `onError`
  rolls back from the snapshot and records a per-row error; `onSettled` clears the
  row's saving flag and invalidates the list.
- Local `useState` still holds the genuinely-UI-only bits: the two confirm-dialog
  targets, the status filter, and the per-row `savingIds` / `rowErrors` (a single
  `useMutation` collapses to one `isPending`, so per-row needs its own map).
- The sort/filter (`visibleItems`) stays a `useMemo` over `data ?? []`.

## Why this and not the alternatives
- **Keep hand-rolling** — every one of caching, refetch, retry, staleness, and
  optimistic-with-rollback is a bug surface we'd own; TanStack Query is the
  standard tool and removes ~half of `useVacancies`.
- **SWR** — comparable, but TanStack's mutation API (`onMutate`/`onError`/
  `onSettled` with context) is a better fit for the optimistic-update flow here.
- **Redux Toolkit Query** — a whole state-management framework for one list and
  one mutation; overkill.

## Consequences
- A failed load now retries once and can be refetched; the list revalidates after
  a mutation.
- Tests must wrap the hook in a `QueryClientProvider` with `retry: false` (see
  `apps/web/src/pages/vacancies/useVacancies.test.ts`).
- The per-row `Set`/`Map` bookkeeping is smaller but still present, now driven by
  mutation callbacks rather than being the core mechanism.

## What this constrains — breaks if you change it
- Rendering `useVacancies` (or anything calling `useQuery`/`useMutation`) outside
  a `QueryClientProvider` → runtime error. `main.tsx` provides it for the app;
  every hook test must provide its own.
- Changing `queryKey` `['vacancies']` in one place but not the mutation's
  `invalidateQueries` / `setQueryData` → optimistic updates and refetches target
  different cache entries; stale UI.
- Removing `retry: false` from the test wrapper → a mocked failure takes seconds
  of backoff before the assertion can see it.

## Related
[ADR-0012](0012-web-hand-written-contract.md), [ADR-0013](0013-accessible-ui-primitives.md),
`apps/web/src/pages/vacancies/useVacancies.ts`, `apps/web/src/lib/queryClient.ts`.
