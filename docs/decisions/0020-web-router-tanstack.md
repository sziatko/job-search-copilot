# 0020 — Web router: `@tanstack/react-router`; TanStack Form deferred

- Status: Accepted · Date: 2026-09

## Context
The web has several pages, and their filters, tabs and statuses should be shareable
and back-button-correct — in the URL, typed and validated.

## Decision
**`@tanstack/react-router`**, code-based routes in `apps/web/src/router.tsx`: `/login`
and `/consent` outside the sign-in guard; under it (`/_app`) `/`, `/vacancies`,
`/vacancies/$id`, `/applications`, `/inbox`, `/profile`. A page's search params are
parsed by its route's `validateSearch` with a zod schema, read with `useSearch({ from })`
and written with `useNavigate`. `QueryClientProvider` wraps the `RouterProvider` in
`main.tsx`.

**TanStack Form is deferred**: the forms are a few fields on `useState`. Adopt it at
the first genuinely complex form.

## Why this and not the alternatives
- **React Router** — its data layer (loaders, revalidation) competes with TanStack
  Query, and its search params are weakly typed.
- **wouter or a hand-rolled switch** — no typed, validated search params.
- **File-based routes** (the router plugin and a generated tree) — build machinery not
  worth it for this many routes.

## Consequences
- A page's view state is its URL: the hooks derive from `useSearch` and navigate on
  change.
- A search schema `.catch()`es junk to the default, so a stale bookmark does not break
  the page. The router hands `validateSearch` JSON-parsed values (a number, not a
  string), so the schemas coerce.
- `router.tsx` imports every page eagerly; no lazy boundaries.
- Tests build a router from the exported `routeTree` over `createMemoryHistory`.

## What this constrains — breaks if you change it
- A route path → the `<Link to>`s, every `useSearch({ from: '/_app/…' })`, the
  memory-history paths in the tests.
- A page's search schema → the route's `validateSearch` and the page's own schema in
  its `types.ts`.
- A route not added to `routeTree` → it 404s, and the tests do not see it.

## Related
[ADR-0011](0011-web-tanstack-query.md).
