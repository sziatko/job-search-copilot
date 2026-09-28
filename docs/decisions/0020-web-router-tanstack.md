# 0020 — Web router: `@tanstack/react-router`; TanStack Form deferred

- Status: Accepted
- Phase: 2   ·   Date: 2026-09

## Context

Phase 1's `apps/web` had no router — `App.tsx` rendered `<VacanciesPage />`
unconditionally. Phase 2 adds a second page (`/applications`) and an index page, and the
`/applications` search box + status filter should be shareable / back-button-correct,
i.e. in the URL.

## Decision

Adopt **`@tanstack/react-router`**, code-based routes (no file-based plugin / route
tree codegen), in `apps/web/src/router.tsx`: `/` (`IndexPage`, two nav cards),
`/vacancies` (the Phase 1 page), `/applications` (`ApplicationsPage`). `/applications`'s
`validateSearch` parses `{ q?, status? }` with a zod schema; `useApplications`
reads it via `useSearch({ from: '/applications' })` and writes it via `useNavigate`.
`App.tsx` becomes `<RouterProvider router={router} />`; `QueryClientProvider` stays
outer in `main.tsx`.

**TanStack Form is deferred.** This phase's forms are `ApplyDialog` (four fields on
`useState`) and one `<select>`. A form library is net-negative complexity now;
revisit at the first multi-step / dynamic form.

## Why this and not the alternatives

- **React Router 7.** Ubiquitous, but its data layer (loaders, revalidation)
  duplicates and competes with TanStack Query, and its search-param typing is
  weaker — no natural fit with this codebase's zod-first, TanStack-Query stack.
- **wouter / a hand-rolled switch.** No typed, validated search params; doesn't
  scale past this phase.
- **File-based routing (`@tanstack/router-plugin` + generated tree).** Build
  machinery not worth it for three routes; adopt later if the route count grows.

## Consequences

- One new runtime dependency (`@tanstack/react-router`). Bundle grew from ~? to
  ~435 kB / 133 kB gzip — acceptable for a single-user local tool.
- The `/applications` view state is a URL, so `useApplications` has no local
  filter/search state — it derives from `useSearch` and navigates on change.
- Route components are code-referenced, so `router.tsx` imports every page eagerly;
  no lazy boundaries yet.
- Tests build a fresh router from the exported `routeTree` with
  `createMemoryHistory` (`router.test.tsx`, `useApplications.test.ts`).

## What this constrains — breaks if you change it

- Renaming a route path → the `<Link to>` targets in `IndexPage` / the page
  back-crumbs, `useSearch`/`useNavigate`'s `from: '/applications'`, and the memory-history
  paths in the router/applications tests.
- Changing the `/applications` search schema → `trackerSearchSchema` in `router.tsx`
  **and** `applicationStatusFilterSchema` in
  [`apps/web/src/pages/applications/types.ts`](../../apps/web/src/pages/applications/types.ts).
- Adding a route without adding it to `routeTree` → it 404s and the tests that
  build from `routeTree` won't see it.

## Related

[ADR-0011](0011-web-tanstack-query.md) (the data layer this sits next to),
[`../contracts.md`](../contracts.md).
