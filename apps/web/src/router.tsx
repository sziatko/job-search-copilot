import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { RootLayout } from './components/RootLayout';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { applicationStatusFilterSchema } from './pages/applications/types';
import { IndexPage } from './pages/IndexPage';
import { VacanciesPage } from './pages/vacancies/VacanciesPage';

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});

const vacanciesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vacancies',
  component: VacanciesPage,
});

// The /tracker search box + status filter live in the URL so the view is
// shareable and the back button works. Parsed / validated by zod on every navigation.
const trackerSearchSchema = z.object({
  q: z.string().optional(),
  status: applicationStatusFilterSchema.optional(),
});

const trackerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tracker',
  component: ApplicationsPage,
  validateSearch: (search): z.infer<typeof trackerSearchSchema> =>
    trackerSearchSchema.parse(search),
});

export const routeTree = rootRoute.addChildren([indexRoute, vacanciesRoute, trackerRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
