import { HttpResponse, http } from 'msw';
import type {
  ApplicationListItem,
  ApplicationStatus,
  UpdateApplicationInput,
} from '@/pages/applications/types';
import type { EstimatedVacancyListItem, UserAction } from '@/pages/vacancies/types';

export const API_URL = 'http://localhost:3000/api/v1';

/** Builds handlers backed by a mutable in-memory `items` array, mirroring what
 * the real API does closely enough for the dashboard's own logic to be tested
 * against — a fake server, not a fake fetch. */
/**
 * The list endpoint's behaviour, as a resolver — exported so a test can *wrap* it
 * (holding one term's request open, phase 2.2 step 6) instead of re-implementing
 * the filter, which is how a fake starts disagreeing with the thing it fakes.
 */
export function estimatedVacanciesResolver(items: EstimatedVacancyListItem[]) {
  return ({ request }: { request: Request }) => {
    // Filter server-side, like the real endpoint, and report `total` as the
    // number of matches rather than the size of the page. That distinction is
    // the whole reason the dashboard can use `limit=1` as a count endpoint, so
    // without it the four parallel requests in dashboard/api.ts are
    // indistinguishable and the counts cannot be tested at all.
    const query = new URL(request.url).searchParams;
    const userAction = query.get('userAction');
    const recommendation = query.get('recommendation');
    const search = query.get('search');
    const company = query.get('company');
    const matching = items.filter(
      (item) =>
        (!userAction || item.userAction === userAction) &&
        (!recommendation || item.recommendation === recommendation) &&
        (!company || item.company.toLowerCase().includes(company.toLowerCase())) &&
        // /vacancies sends its term here rather than filtering client-side, so
        // without this the page's search tests would pass while doing nothing.
        (!search ||
          item.company.toLowerCase().includes(search.toLowerCase()) ||
          item.title.toLowerCase().includes(search.toLowerCase())),
    );
    const limit = Number(query.get('limit') ?? 100);
    // `companyMatchCount` is derived by the real endpoint (ADR-0025), counted
    // over every vacancy, not just the page — so the fake derives it too, and
    // the UI's button is exercised against the semantics the API actually has.
    const page = matching.slice(0, limit).map((item) => ({
      ...item,
      companyMatchCount: items.filter((candidate) =>
        candidate.company.toLowerCase().includes(item.company.toLowerCase()),
      ).length,
      // Derived the same way the endpoint derives it (phase 2.2, step 7) rather than
      // hand-set per fixture: a fixture is a placeholder by carrying the sentinel
      // `estimationComment: 'N/A'`, which is what the importer actually writes.
      hasAnalysis: item.estimationComment !== 'N/A',
    }));
    return HttpResponse.json({ items: page, total: matching.length });
  };
}

export function buildHandlers(items: EstimatedVacancyListItem[]) {
  return [
    http.get(`${API_URL}/estimated-vacancies`, estimatedVacanciesResolver(items)),
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
        statusUpdatedAt: now,
        comments: [],
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
    http.get(`${API_URL}/applications`, ({ request }) => {
      // Sorted and sliced like the real endpoint — `appliedAt desc` with `id desc`
      // as the tiebreaker (the core has the same order, for the same reason). The
      // web's log loader pages this, so a fake that ignored limit/offset would let
      // a broken loader pass: `onUnhandledRequest: 'error'` would not fire, and the
      // loop would read the same thousand rows as page one, forever.
      const query = new URL(request.url).searchParams;
      const limit = Number(query.get('limit') ?? 50);
      const offset = Number(query.get('offset') ?? 0);
      const sorted = [...applications].sort(
        (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime() || b.id - a.id,
      );
      return HttpResponse.json({
        items: sorted.slice(offset, offset + limit),
        total: applications.length,
      });
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
    // Same rule as ApplicationService.update: absent is untouched, blank clears.
    http.patch(`${API_URL}/applications/:id`, async ({ params, request }) => {
      const app = applications.find((a) => a.id === Number(params.id));
      if (!app) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as UpdateApplicationInput;
      const text = (value: string | null | undefined, current: string | null) =>
        value === undefined ? current : value?.trim() || null;
      app.salaryInListing = text(body.salaryInListing, app.salaryInListing);
      app.userComment = text(body.userComment, app.userComment);
      app.usedTailoredResume = body.usedTailoredResume ?? app.usedTailoredResume;
      return HttpResponse.json(app);
    }),
    http.post(`${API_URL}/applications/:id/comments`, async ({ params, request }) => {
      const app = applications.find((a) => a.id === Number(params.id));
      if (!app) {
        return new HttpResponse(null, { status: 404 });
      }
      const { body } = (await request.json()) as { body: string };
      if (!body.trim()) {
        return HttpResponse.json(
          { statusCode: 400, message: ['body must not be blank'] },
          { status: 400 },
        );
      }
      const ids = app.comments.map((c) => c.id);
      app.comments = [
        ...app.comments,
        { id: Math.max(0, ...ids) + 1, createdAt: new Date().toISOString(), body: body.trim() },
      ];
      return HttpResponse.json(app, { status: 201 });
    }),
  ];
}
