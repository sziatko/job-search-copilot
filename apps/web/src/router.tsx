import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { RootLayout } from './components/RootLayout';
import type { RouteMeta } from './lib/routeMeta';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { applicationStatusFilterSchema } from './pages/applications/types';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { LogPage } from './pages/log/LogPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { statusFilterSchema as vacancyStatusFilterSchema } from './pages/vacancies/types';
import { VacanciesPage } from './pages/vacancies/VacanciesPage';
import { VacancyPage } from './pages/vacancy/VacancyPage';

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
const APPLICATIONS_META: RouteMeta = {
  title: 'Application tracker',
  subtitle: "Every application you've sent and where it stands",
  rail: true,
};
const LOG_META: RouteMeta = {
  title: 'Vacancy log',
  subtitle: 'Dedup cache of every posting the pipeline has ever seen',
  rail: true,
};
const VACANCY_META: RouteMeta = {
  title: 'Vacancy details',
  subtitle: 'Full posting, history, and other roles at this company',
  rail: false,
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

// The search box of /log. Unlike the tracker's, the term is not used to filter in the
// browser: it is sent to the API (ADR-0030).
const termSearchSchema = z.object({
  q: termSchema,
});

// /vacancies: the term and the status filter both go to the API (ADR-0025, ADR-0030).
// An absent `status` is the NOT_REVIEWED default.
const vacanciesSearchSchema = z.object({
  q: termSchema,
  status: vacancyStatusFilterSchema.optional().catch(undefined),
});

const vacanciesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vacancies',
  component: VacanciesPage,
  staticData: VACANCIES_META,
  validateSearch: (search): z.infer<typeof vacanciesSearchSchema> =>
    vacanciesSearchSchema.parse(search),
});

// One vacancy. A sibling of /vacancies, not its child: /vacancies renders no <Outlet />.
const vacancyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vacancies/$id',
  component: VacancyPage,
  staticData: VACANCY_META,
});

const logRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/log',
  component: LogPage,
  staticData: LOG_META,
  validateSearch: (search): z.infer<typeof termSearchSchema> => termSearchSchema.parse(search),
});

// No backend behind this one yet — see the page for what is missing.
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
  staticData: PROFILE_META,
});

// The /applications search box + status filter. Parsed / validated by zod on every
// navigation — see the note above on why both are lenient.
const applicationsSearchSchema = z.object({
  q: termSchema,
  status: statusFilterSchema,
});

const applicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/applications',
  component: ApplicationsPage,
  staticData: APPLICATIONS_META,
  validateSearch: (search): z.infer<typeof applicationsSearchSchema> =>
    applicationsSearchSchema.parse(search),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  vacanciesRoute,
  vacancyRoute,
  applicationsRoute,
  logRoute,
  profileRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
