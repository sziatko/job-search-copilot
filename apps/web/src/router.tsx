import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { RootLayout } from './components/RootLayout';
import type { RouteMeta } from './lib/routeMeta';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { applicationStatusFilterSchema } from './pages/applications/types';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { LogPage } from './pages/log/LogPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { VacanciesPage } from './pages/vacancies/VacanciesPage';

const rootRoute = createRootRoute({ component: RootLayout });

/**
 * Chrome metadata, read by RootLayout through `useMatches()`. Typed as
 * RouteMeta rather than inlined so a route can't ship without a title.
 *
 * `rail` is the mockup's RAIL_BY_DEFAULT: table-heavy views start with the
 * sidebar collapsed to an icon rail so the tables get the width; the dashboard
 * keeps it open. A manual toggle overrides it until the next navigation.
 */
const DASHBOARD_META: RouteMeta = {
  title: 'Dashboard',
  subtitle: 'Your job search, at a glance',
  rail: false,
};
const VACANCIES_META: RouteMeta = {
  title: 'Analyzed vacancies',
  subtitle: "Review the analyzer's shortlist and triage what to apply to",
  rail: true,
};
const TRACKER_META: RouteMeta = {
  title: 'Application tracker',
  subtitle: "Every application you've sent and where it stands",
  rail: true,
};
const LOG_META: RouteMeta = {
  title: 'Vacancy log',
  subtitle: 'Dedup cache of every posting the pipeline has ever seen',
  rail: true,
};
const PROFILE_META: RouteMeta = {
  title: 'Profile & forms',
  subtitle: 'Coming soon',
  rail: false,
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
  staticData: DASHBOARD_META,
});

// Search terms and filters in the URL, so a view is shareable and the back button
// works. Values arrive **JSON-parsed** by the router — `?q=2024` is the number 2024 —
// so a strict `z.string()` threw inside `validateSearch`, and with no `errorComponent`
// anywhere in the tree that replaces the whole page with "Something went wrong!" for a
// URL a user can trivially type. `q` coerces (the term is a string by the time it is
// typed into a box anyway); `status` is an enum, where no coercion could be right, so
// junk falls back to "no filter" — the same state an absent value means.
const termSchema = z.coerce.string().optional();
const statusFilterSchema = applicationStatusFilterSchema.optional().catch(undefined);

// /vacancies' search box. Unlike the tracker's, the term is not used to filter in
// the browser: it is sent to the API (ADR-0025), so it is the only filter that has
// to survive in the URL. The status filter stays component state.
const vacanciesSearchSchema = z.object({
  q: termSchema,
});

const vacanciesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vacancies',
  component: VacanciesPage,
  staticData: VACANCIES_META,
  validateSearch: (search): z.infer<typeof vacanciesSearchSchema> =>
    vacanciesSearchSchema.parse(search),
});

// No backend behind either of these yet — see the pages for what is missing.
const logRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/log',
  component: LogPage,
  staticData: LOG_META,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
  staticData: PROFILE_META,
});

// The /tracker search box + status filter. Parsed / validated by zod on every
// navigation — see the note above on why both are lenient.
const trackerSearchSchema = z.object({
  q: termSchema,
  status: statusFilterSchema,
});

const trackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tracker',
  component: ApplicationsPage,
  staticData: TRACKER_META,
  validateSearch: (search): z.infer<typeof trackerSearchSchema> =>
    trackerSearchSchema.parse(search),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  vacanciesRoute,
  trackerRoute,
  logRoute,
  profileRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
