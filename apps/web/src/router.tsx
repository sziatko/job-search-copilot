import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { RootLayout } from './components/RootLayout';
import type { RouteMeta } from './lib/routeMeta';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { applicationStatusFilterSchema } from './pages/applications/types';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { InboxPage, inboxTabSchema } from './pages/inbox/InboxPage';
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
  rail: false,
};
const VACANCIES_META: RouteMeta = {
  title: 'Analyzed vacancies',
  rail: true,
};
const APPLICATIONS_META: RouteMeta = {
  title: 'Application tracker',
  rail: true,
};
const INBOX_META: RouteMeta = {
  title: 'Inbox',
  rail: true,
};
const VACANCY_META: RouteMeta = {
  title: 'Vacancy details',
  rail: false,
};
const PROFILE_META: RouteMeta = {
  title: 'Profile & forms',
  rail: false,
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
  staticData: DASHBOARD_META,
});

// Filters in the URL, so a view is shareable and the back button works. Values arrive
// **JSON-parsed** by the router, and a value `validateSearch` throws on replaces the
// whole page with "Something went wrong!" (there is no `errorComponent` anywhere in the
// tree) — for a URL a user can trivially type. So junk falls back to "no filter", the
// same state an absent value means. An unknown key is dropped by `z.object`: an old
// `?q=` bookmark, from when the toolbar had a search box, is ignored (search is a modal
// now, with no URL state).
const statusFilterSchema = applicationStatusFilterSchema.optional().catch(undefined);

// /vacancies: the status filter goes to the API (ADR-0030). An absent `status` is the
// NOT_REVIEWED default — and so is a bookmarked `?status=APPLIED`, from when the filter
// still listed the pipeline.
const vacanciesSearchSchema = z.object({
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

// /inbox's tab; junk falls back to the Queue, as an absent value does.
const inboxSearchSchema = z.object({
  tab: inboxTabSchema.optional().catch(undefined),
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox',
  component: InboxPage,
  staticData: INBOX_META,
  validateSearch: (search): z.infer<typeof inboxSearchSchema> => inboxSearchSchema.parse(search),
});

// No backend behind this one yet — see the page for what is missing.
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
  staticData: PROFILE_META,
});

// The /applications status filter. Parsed / validated by zod on every navigation —
// see the note above on why it is lenient.
const applicationsSearchSchema = z.object({
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
  inboxRoute,
  profileRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
