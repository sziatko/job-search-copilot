import { HttpResponse, http } from 'msw';
import type { ApplicationListItem, ApplicationStatus } from '@/features/applications/types';
import type { EstimatedVacancyListItem, UserAction } from '@/features/vacancies/types';

const API_URL = 'http://localhost:3000/api/v1';

/** Builds handlers backed by a mutable in-memory `items` array, mirroring what
 * the real API does closely enough for the dashboard's own logic to be tested
 * against — a fake server, not a fake fetch. */
export function buildHandlers(items: EstimatedVacancyListItem[]) {
  return [
    http.get(`${API_URL}/estimated-vacancies`, () => {
      return HttpResponse.json({ items, total: items.length });
    }),
    http.patch(`${API_URL}/estimated-vacancies/:id/user-action`, async ({ params, request }) => {
      const id = Number(params.id);
      const item = items.find((i) => i.id === id);
      if (!item) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as { userAction: UserAction };
      item.userAction = body.userAction;
      item.userActionUpdatedAt = new Date().toISOString();
      return HttpResponse.json(item);
    }),
    // POST /applications — the APPLIED path on the /vacancies page. Flips the
    // matching vacancy's userAction, like the real server does in one transaction.
    http.post(`${API_URL}/applications`, async ({ request }) => {
      const body = (await request.json()) as {
        estimatedVacancyId: number;
        salaryInListing?: string;
        usedTailoredResume?: boolean;
        userComment?: string;
      };
      const item = items.find((i) => i.id === body.estimatedVacancyId);
      if (item) item.userAction = 'APPLIED';
      const now = new Date().toISOString();
      const application: ApplicationListItem = {
        id: 1,
        appliedAt: now,
        status: 'APPLIED',
        statusUpdatedAt: null,
        salaryInListing: body.salaryInListing ?? null,
        usedTailoredResume: body.usedTailoredResume ?? false,
        userComment: body.userComment ?? null,
        createdAt: now,
        updatedAt: now,
        estimatedVacancyId: body.estimatedVacancyId,
        company: item?.company ?? 'Acme',
        title: item?.title ?? 'Role',
        applyUrl: item?.applyUrl ?? 'https://example.com/1',
        matchScore: item?.matchScore ?? 0,
        recommendation: item?.recommendation ?? 'APPLY',
        estimationComment: item?.estimationComment ?? 'N/A',
      };
      return HttpResponse.json({ application, resolution: 'linked-by-id', vacancyCreated: false });
    }),
  ];
}

/** Fake server for the /tracker page, backed by a mutable in-memory list. */
export function buildApplicationHandlers(applications: ApplicationListItem[]) {
  return [
    http.get(`${API_URL}/applications`, () => {
      return HttpResponse.json({ items: applications, total: applications.length });
    }),
    http.patch(`${API_URL}/applications/:id/status`, async ({ params, request }) => {
      const id = Number(params.id);
      const app = applications.find((a) => a.id === id);
      if (!app) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as { status: ApplicationStatus };
      app.status = body.status;
      app.statusUpdatedAt = new Date().toISOString();
      return HttpResponse.json(app);
    }),
  ];
}
