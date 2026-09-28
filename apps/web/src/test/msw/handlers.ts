import { HttpResponse, http } from 'msw';
import {
  type ApplicationListItem,
  isPipelineStatus,
  type UpdateApplicationInput,
} from '@/pages/applications/types';
import type { VacancyListItem, VacancyStatus } from '@/pages/vacancies/types';

export const API_URL = 'http://localhost:3000/api/v1';

/**
 * One row of the fake's single table, like the real `Vacancy`: what /vacancies lists
 * and what /applications lists are two views of the same rows, so applying on one
 * page is what the other page reads.
 */
export type FakeVacancy = VacancyListItem &
  Pick<
    ApplicationListItem,
    'statusChangedAt' | 'appliedAt' | 'comments' | 'salaryInListing' | 'usedTailoredResume'
  >;

/** A row with every field filled — tests override what they are about. */
export function fakeVacancy(overrides: Partial<FakeVacancy> = {}): FakeVacancy {
  return {
    id: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/1',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    status: 'NOT_REVIEWED',
    statusChangedAt: '2026-09-01T00:00:00.000Z',
    appliedAt: null,
    comments: [],
    salaryInListing: null,
    usedTailoredResume: false,
    ...overrides,
  };
}

/** writeStatus: every write is an event; applying stamps the applied date. */
function moveTo(row: FakeVacancy, status: VacancyStatus) {
  const now = new Date().toISOString();
  row.status = status;
  row.statusChangedAt = now;
  if (status === 'APPLIED') row.appliedAt = now;
}

function addComment(row: FakeVacancy, body: string | null | undefined) {
  const note = body?.trim();
  if (!note) return;
  const ids = row.comments.map((c) => c.id);
  row.comments = [
    ...row.comments,
    {
      id: Math.max(0, ...ids) + 1,
      createdAt: new Date().toISOString(),
      body: note,
      source: 'USER',
    },
  ];
}

/**
 * The list endpoint's behaviour, as a resolver — exported so a test can *wrap* it
 * (holding one term's request open, phase 2.2 step 6) instead of re-implementing
 * the filter, which is how a fake starts disagreeing with the thing it fakes.
 */
export function vacanciesResolver(rows: FakeVacancy[]) {
  return ({ request }: { request: Request }) => {
    // Filter server-side, like the real endpoint, and report `total` as the
    // number of matches rather than the size of the page. That distinction is
    // the whole reason the dashboard can use `limit=1` as a count endpoint, so
    // without it the four parallel requests in dashboard/api.ts are
    // indistinguishable and the counts cannot be tested at all.
    const query = new URL(request.url).searchParams;
    const statuses = query.get('status')?.split(',');
    const recommendation = query.get('recommendation');
    const search = query.get('search');
    const company = query.get('company');
    const matching = rows.filter(
      (row) =>
        (!statuses || statuses.includes(row.status)) &&
        (!recommendation || row.recommendation === recommendation) &&
        (!company || row.company.toLowerCase().includes(company.toLowerCase())) &&
        // /vacancies sends its term here rather than filtering client-side, so
        // without this the page's search tests would pass while doing nothing.
        (!search ||
          row.company.toLowerCase().includes(search.toLowerCase()) ||
          row.title.toLowerCase().includes(search.toLowerCase())),
    );
    const limit = Number(query.get('limit') ?? 100);
    // `companyMatchCount` is derived by the real endpoint (ADR-0025), counted
    // over every vacancy, not just the page — so the fake derives it too, and
    // the UI's button is exercised against the semantics the API actually has.
    const page = matching.slice(0, limit).map((row) => ({
      ...row,
      companyMatchCount: rows.filter((candidate) =>
        candidate.company.toLowerCase().includes(row.company.toLowerCase()),
      ).length,
      // Derived the same way the endpoint derives it (phase 2.2, step 7) rather than
      // hand-set per fixture: a fixture is a placeholder by having no analyzer
      // comment, which is what `ApplicationService` actually writes.
      hasAnalysis: row.estimationComment !== null,
    }));
    return HttpResponse.json({ items: page, total: matching.length });
  };
}

/** Builds handlers backed by one mutable in-memory table, mirroring what the real API
 * does closely enough for the pages' own logic to be tested against — a fake server,
 * not a fake fetch. Both pages' endpoints read and write the same `rows`. */
export function buildHandlers(rows: FakeVacancy[]) {
  const find = (id: unknown) => rows.find((row) => row.id === Number(id));
  return [
    http.get(`${API_URL}/vacancies`, vacanciesResolver(rows)),
    http.patch(`${API_URL}/vacancies/:id/status`, async ({ params, request }) => {
      const row = find(params.id);
      if (!row) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as { status: VacancyStatus };
      moveTo(row, body.status);
      return HttpResponse.json(row);
    }),
    // POST /applications — applying on the /vacancies page. Moves the row to APPLIED
    // and sets what the dialog wrote, like the real server does in one transaction.
    http.post(`${API_URL}/applications`, async ({ request }) => {
      const body = (await request.json()) as {
        vacancyId: number;
        salaryInListing?: string;
        usedTailoredResume?: boolean;
        comment?: string;
      };
      const row = find(body.vacancyId);
      if (!row) {
        return HttpResponse.json({ message: 'Vacancy not found' }, { status: 422 });
      }
      if (isPipelineStatus(row.status)) {
        return HttpResponse.json(
          { message: `Vacancy ${row.id} is already ${row.status}` },
          { status: 422 },
        );
      }
      moveTo(row, 'APPLIED');
      row.salaryInListing = body.salaryInListing?.trim() || null;
      row.usedTailoredResume = body.usedTailoredResume ?? false;
      addComment(row, body.comment);
      return HttpResponse.json({
        application: row,
        resolution: 'linked-by-id',
        vacancyCreated: false,
      });
    }),
    http.get(`${API_URL}/applications`, ({ request }) => {
      // The pipeline rows, sorted and sliced like the real endpoint —
      // `statusChangedAt desc` with `id desc` as the tiebreaker. The web's log loader
      // pages this, so a fake that ignored limit/offset would let a broken loader
      // pass: `onUnhandledRequest: 'error'` would not fire, and the loop would read
      // the same thousand rows as page one, forever.
      const query = new URL(request.url).searchParams;
      const limit = Number(query.get('limit') ?? 50);
      const offset = Number(query.get('offset') ?? 0);
      const pipeline = rows
        .filter((row) => isPipelineStatus(row.status))
        .sort(
          (a, b) =>
            new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime() ||
            b.id - a.id,
        );
      return HttpResponse.json({
        items: pipeline.slice(offset, offset + limit),
        total: pipeline.length,
      });
    }),
    http.patch(`${API_URL}/applications/:id/status`, async ({ params, request }) => {
      const row = find(params.id);
      if (!row) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as { status: VacancyStatus; comment?: string };
      moveTo(row, body.status);
      addComment(row, body.comment);
      return HttpResponse.json(row);
    }),
    // Same rule as ApplicationService.update: absent is untouched, blank clears, and a
    // non-blank comment is appended as a USER one.
    http.patch(`${API_URL}/applications/:id`, async ({ params, request }) => {
      const row = find(params.id);
      if (!row) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as UpdateApplicationInput;
      const text = (value: string | null | undefined, current: string | null) =>
        value === undefined ? current : value?.trim() || null;
      row.salaryInListing = text(body.salaryInListing, row.salaryInListing);
      row.usedTailoredResume = body.usedTailoredResume ?? row.usedTailoredResume;
      addComment(row, body.comment);
      return HttpResponse.json(row);
    }),
  ];
}
