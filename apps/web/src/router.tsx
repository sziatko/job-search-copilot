import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { RootLayout } from './components/RootLayout';
import { authClient } from './lib/auth';
import type { RouteMeta } from './lib/routeMeta';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { applicationStatusFilterSchema } from './pages/applications/types';
import { ConsentPage } from './pages/consent/ConsentPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { InboxPage, inboxTabSchema } from './pages/inbox/InboxPage';
import { LoginPage } from './pages/login/LoginPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { statusFilterSchema as vacancyStatusFilterSchema } from './pages/vacancies/types';
import { VacanciesPage } from './pages/vacancies/VacanciesPage';
import { VacancyPage } from './pages/vacancy/VacancyPage';

// The root renders only its <Outlet />: /login has no shell around it.
const rootRoute = createRootRoute();

/**
 * Every page but /login: the shell, behind a session. A pathless layout route, so the
 * guard sits on one node and /login, its sibling, is outside it. No session (or no
 * answer from the API) → /login; the API refuses every route without one anyway
 * (invariant 9), this only spares the user a page of 401s.
 */
// ponytail: one GET /api/auth/get-session per navigation; cache it if that ever shows.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: RootLayout,
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data) throw redirect({ to: '/login' });
  },
});

// `error` is what Better Auth appends to `errorCallbackURL` when a social sign-in
// fails — an email outside AUTH_ALLOWED_EMAILS, a cancelled consent. The keys it drops
// stay in the URL (the router's `search.strict` is off): an MCP client's authorization
// request arrives here as a signed query that sign-in must post back (lib/auth.ts).
const loginSearchSchema = z.object({ error: z.string().optional().catch(undefined) });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  validateSearch: (search): z.infer<typeof loginSearchSchema> => loginSearchSchema.parse(search),
});

// An MCP client asking for access (ADR-0035). Outside the shell, like /login; the API
// sends only a signed-in user here. Its query is the signed request, read raw.
const consentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/consent',
  component: ConsentPage,
});

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
  getParentRoute: () => appRoute,
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
  getParentRoute: () => appRoute,
  path: '/vacancies',
  component: VacanciesPage,
  staticData: VACANCIES_META,
  validateSearch: (search): z.infer<typeof vacanciesSearchSchema> =>
    vacanciesSearchSchema.parse(search),
});

// One vacancy. A sibling of /vacancies, not its child: /vacancies renders no <Outlet />.
const vacancyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/vacancies/$id',
  component: VacancyPage,
  staticData: VACANCY_META,
});

// /inbox's tab; junk falls back to the Queue, as an absent value does.
const inboxSearchSchema = z.object({
  tab: inboxTabSchema.optional().catch(undefined),
});

const inboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/inbox',
  component: InboxPage,
  staticData: INBOX_META,
  validateSearch: (search): z.infer<typeof inboxSearchSchema> => inboxSearchSchema.parse(search),
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
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
  getParentRoute: () => appRoute,
  path: '/applications',
  component: ApplicationsPage,
  staticData: APPLICATIONS_META,
  validateSearch: (search): z.infer<typeof applicationsSearchSchema> =>
    applicationsSearchSchema.parse(search),
});

export const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    indexRoute,
    vacanciesRoute,
    vacancyRoute,
    applicationsRoute,
    inboxRoute,
    profileRoute,
  ]),
  loginRoute,
  consentRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
