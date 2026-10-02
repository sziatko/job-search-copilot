/**
 * Per-route chrome metadata, read by RootLayout via `useMatches().at(-1)`.
 *
 * This lives on the route rather than in a pathname lookup table: the title
 * stays next to the route it describes, and adding a route can't leave a stale
 * entry behind in a second file.
 *
 * `rail` is the mockup's RAIL_BY_DEFAULT behaviour — table-heavy views start
 * with the sidebar collapsed to an icon rail so the tables get the width, while
 * the dashboard keeps it open. A manual toggle overrides it until the next
 * navigation.
 */
export interface RouteMeta {
  title: string;
  rail: boolean;
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption extends Partial<RouteMeta> {}
}
