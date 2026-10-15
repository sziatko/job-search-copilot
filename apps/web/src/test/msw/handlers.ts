import { HttpResponse, http } from 'msw';
import {
  type ApplicationListItem,
  isPipelineStatus,
  type UpdateApplicationInput,
} from '@/pages/applications/types';
import type { Stats } from '@/pages/dashboard/types';
import type { VacancyDetail, VacancyListItem, VacancyStatus } from '@/pages/vacancies/types';

export const API_URL = 'http://localhost:3000/api/v1';

/** The Postgres enum's order, which `sort=recommended` sorts by — unanalysed last. */
const RECOMMENDATION_RANK = { APPLY: 0, APPLY_WITH_CAVEATS: 1, SKIP: 2, null: 3 } as const;

/**
 * One row of the fake's single table, like the real `Vacancy`: what /vacancies lists
 * and what /applications lists are two views of the same rows, so applying on one
 * page is what the other page reads.
 */
export type FakeVacancy = VacancyListItem &
  Pick<
    ApplicationListItem,
    'statusChangedAt' | 'appliedAt' | 'comments' | 'salaryInApplication' | 'usedTailoredResume'
  > &
  // Only GET /vacancies/:id reads these; `asDetail` fills them when a test does not.
  Partial<Pick<VacancyDetail, 'fullText' | 'timeline'>>;

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
    salaryInApplication: null,
    usedTailoredResume: false,
    ...overrides,
  };
}

/** Core's timeout rule (ADR-0031), which the real endpoint sends as `timedOut`:
 * open, and not moved for 30 days. */
function isTimedOut(row: FakeVacancy) {
  return (
    isPipelineStatus(row.status) &&
    row.status !== 'REJECTED' &&
    row.status !== 'OFFER' &&
    Date.parse(row.statusChangedAt) < Date.now() - 30 * 86_400_000
  );
}

/** A row as an `/applications` item — every response the web parses as one. */
function asApplication(row: FakeVacancy) {
  return { ...row, timedOut: isTimedOut(row) };
}

/** Core's `companyKey` equality (ADR-0032), cut down to case: core's tests own the
 * rule, these only need one company to be one company. */
function sameCompany(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

/** Core's `companyMatchCount`: this row, plus every other row of the same company but
 * FILTERED_OUT — so `count − 1` is exactly the others `sameCompanyAs` lists. */
function companyMatchCount(rows: FakeVacancy[], row: FakeVacancy) {
  return rows.filter(
    (candidate) =>
      (candidate === row || candidate.status !== 'FILTERED_OUT') &&
      sameCompany(candidate.company, row.company),
  ).length;
}

/** A row as GET /vacancies/:id — the journal starts at NEW on `createdAt`, as
 * `firstStatus` writes it, then NOT_REVIEWED as `save` does. */
function asDetail(row: FakeVacancy): VacancyDetail {
  return {
    ...row,
    updatedAt: row.statusChangedAt,
    // `undefined` = the test does not care; `null` = no posting text.
    fullText: row.fullText === undefined ? 'Full vacancy text.' : row.fullText,
    timeline: row.timeline ?? [
      { status: 'NEW', createdAt: row.createdAt },
      { status: 'NOT_REVIEWED', createdAt: row.createdAt },
    ],
  };
}

/** writeStatus: every write is an event, journaled; applying stamps the applied date. */
function moveTo(row: FakeVacancy, status: VacancyStatus) {
  const now = new Date().toISOString();
  row.timeline = [...asDetail(row).timeline, { status, createdAt: now }];
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
 * (holding one filter's request open, phase 2.2 step 6) instead of re-implementing
 * the filter, which is how a fake starts disagreeing with the thing it fakes.
 */
export function vacanciesResolver(rows: FakeVacancy[]) {
  return ({ request }: { request: Request }) => {
    // Filter server-side, like the real endpoint, and report `total` as the
    // number of matches rather than the size of the page — the tables' footers read it.
    const query = new URL(request.url).searchParams;
    const statuses = query.get('status')?.split(',');
    const recommendation = query.get('recommendation');
    const search = query.get('search');
    const sameCompanyAs = query.get('sameCompanyAs');
    const hasText = query.get('hasText');
    const cursor = query.get('cursor');
    // The server's two orders (ADR-0030), each ending on `id`.
    const byOrder =
      query.get('sort') === 'recommended'
        ? (a: FakeVacancy, b: FakeVacancy) =>
            RECOMMENDATION_RANK[`${a.recommendation}`] -
              RECOMMENDATION_RANK[`${b.recommendation}`] ||
            (b.matchScore ?? -1) - (a.matchScore ?? -1) ||
            b.id - a.id
        : (a: FakeVacancy, b: FakeVacancy) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
    const matches = (row: FakeVacancy) =>
      (!statuses || statuses.includes(row.status)) &&
      (!recommendation || row.recommendation === recommendation) &&
      (!sameCompanyAs ||
        (row.status !== 'FILTERED_OUT' && sameCompany(row.company, sameCompanyAs))) &&
      // `fullText` undefined = the test does not care, and counts as text — as below.
      (hasText === null || (row.fullText !== null) === (hasText === 'true')) &&
      // The search modal sends its term here rather than filtering client-side, so
      // without this the modal's tests would pass while doing nothing.
      (!search ||
        row.company.toLowerCase().includes(search.toLowerCase()) ||
        row.title.toLowerCase().includes(search.toLowerCase()));
    // The cursor is a place in the whole order, not in the filtered rows: a cursor row
    // that has since left the filter still marks where the next page starts, as it
    // does on the server.
    const sorted = [...rows].sort(byOrder);
    const after = cursor
      ? sorted.slice(sorted.findIndex((row) => row.id === Number(cursor)) + 1)
      : sorted;
    const matching = after.filter(matches);
    const limit = Number(query.get('limit') ?? 100);
    // `companyMatchCount` is derived by the real endpoint (ADR-0025), counted
    // over every vacancy, not just the page — so the fake derives it too, and
    // the UI's button is exercised against the semantics the API actually has.
    const more = matching.length > limit;
    const page = matching.slice(0, limit).map((row) => ({
      ...row,
      companyMatchCount: companyMatchCount(rows, row),
      // Derived the same way the endpoint derives it (phase 2.2, step 7) rather than
      // hand-set per fixture: a fixture is unanalysed by having no recommendation,
      // which is what `ApplicationService` writes for a placeholder.
      hasAnalysis: row.recommendation !== null,
      // `fullText` undefined = the test does not care, as in `asDetail`.
      hasText: row.fullText !== null,
    }));
    return HttpResponse.json({
      items: page,
      total: sorted.filter(matches).length,
      nextCursor: more ? (page.at(-1)?.id ?? null) : null,
    });
  };
}

/**
 * Holds each GET to `path` that `when` picks until the test calls `release()` — a
 * page caught mid-load, with no timer to race. The resolver then returns nothing,
 * which in MSW 2 falls through to the next matching handler (unlike `passthrough()`,
 * which makes the real request), so it must be registered in front of that one.
 */
export function holdGet(path: string, when: (url: URL) => boolean = () => true) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handler = http.get(`${API_URL}${path}`, async ({ request }) => {
    if (when(new URL(request.url))) await held;
  });
  return { handler, release: () => release() };
}

/** Builds handlers backed by one mutable in-memory table, mirroring what the real API
 * does closely enough for the pages' own logic to be tested against — a fake server,
 * not a fake fetch. Both pages' endpoints read and write the same `rows`. */
export function buildHandlers(rows: FakeVacancy[]) {
  const find = (id: unknown) => rows.find((row) => row.id === Number(id));
  return [
    http.get(`${API_URL}/vacancies`, vacanciesResolver(rows)),
    http.get(`${API_URL}/vacancies/:id`, ({ params }) => {
      const row = find(params.id);
      return row ? HttpResponse.json(asDetail(row)) : new HttpResponse(null, { status: 404 });
    }),
    http.patch(`${API_URL}/vacancies/:id/status`, async ({ params, request }) => {
      const row = find(params.id);
      if (!row) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as { status: VacancyStatus; comment?: string };
      moveTo(row, body.status);
      addComment(row, body.comment);
      return HttpResponse.json(row);
    }),
    // POST /applications — applying on the /vacancies page. Moves the row to APPLIED
    // and sets what the dialog wrote, like the real server does in one transaction.
    http.post(`${API_URL}/applications`, async ({ request }) => {
      const body = (await request.json()) as {
        vacancyId: number;
        salaryInApplication?: string;
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
      row.salaryInApplication = body.salaryInApplication?.trim() || null;
      row.usedTailoredResume = body.usedTailoredResume ?? false;
      addComment(row, body.comment);
      return HttpResponse.json({
        application: asApplication(row),
        resolution: 'linked-by-id',
        vacancyCreated: false,
      });
    }),
    http.get(`${API_URL}/applications`, ({ request }) => {
      // The pipeline rows, filtered, sorted and cursor-paged like the real endpoint —
      // `statusChangedAt desc` with `id desc` as the tiebreaker — so a page that
      // filtered client-side, or ignored `nextCursor`, would fail rather than pass.
      const query = new URL(request.url).searchParams;
      const limit = Number(query.get('limit') ?? 50);
      const cursor = query.get('cursor');
      const status = query.get('status');
      const state = query.get('state');
      const search = query.get('search')?.toLowerCase();
      const sameCompanyAs = query.get('sameCompanyAs');
      const matches = (row: FakeVacancy) =>
        isPipelineStatus(row.status) &&
        (!sameCompanyAs || sameCompany(row.company, sameCompanyAs)) &&
        (!status || row.status === status) &&
        (!state ||
          (state === 'timedOut'
            ? isTimedOut(row)
            : row.status !== 'REJECTED' && row.status !== 'OFFER' && !isTimedOut(row))) &&
        (!search ||
          row.company.toLowerCase().includes(search) ||
          row.title.toLowerCase().includes(search));
      const sorted = [...rows].sort(
        (a, b) =>
          new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime() ||
          b.id - a.id,
      );
      const after = cursor
        ? sorted.slice(sorted.findIndex((row) => row.id === Number(cursor)) + 1)
        : sorted;
      const matching = after.filter(matches);
      const page = matching
        .slice(0, limit)
        .map((row) => ({ ...asApplication(row), companyMatchCount: companyMatchCount(rows, row) }));
      return HttpResponse.json({
        items: page,
        total: sorted.filter(matches).length,
        nextCursor: matching.length > limit ? (page.at(-1)?.id ?? null) : null,
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
      return HttpResponse.json(asApplication(row));
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
      row.salaryInApplication = text(body.salaryInApplication, row.salaryInApplication);
      row.usedTailoredResume = body.usedTailoredResume ?? row.usedTailoredResume;
      addComment(row, body.comment);
      return HttpResponse.json(asApplication(row));
    }),
  ];
}

/** A `/stats` body, all zeros — tests set what they are about. Not derived from a
 * `buildHandlers` table: the funnel counts the journal, which the fake does not keep. */
export function fakeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    logged: 0,
    awaitingAnalysis: 0,
    awaitingTriage: 0,
    recommended: 0,
    notRecommended: 0,
    applied: 0,
    declined: 0,
    unavailable: 0,
    responded: 0,
    interview: 0,
    actionNeeded: 0,
    pipeline: {
      byStatus: {
        APPLIED: 0,
        ACTION_NEEDED: 0,
        INTERVIEW: 0,
        AWAITING: 0,
        OFFER: 0,
        REJECTED: 0,
      },
      active: 0,
      timedOut: 0,
      total: 0,
    },
    recent: [],
    ...overrides,
  };
}

export function statsHandler(stats: Stats = fakeStats()) {
  return http.get(`${API_URL}/stats`, () => HttpResponse.json(stats));
}

export const AUTH_URL = 'http://localhost:3000/api/auth';

/** GET /api/auth/get-session: a signed-in user, or Better Auth's `null` for none. The
 * shell's guard asks it on every navigation, so `server.ts` installs the signed-in one
 * for every test; a test about signing in overrides it. */
export function sessionHandler(signedIn = true) {
  return http.get(`${AUTH_URL}/get-session`, () =>
    HttpResponse.json(
      signedIn
        ? {
            session: { id: 's1', userId: 'u1', token: 't', expiresAt: '2099-01-01T00:00:00.000Z' },
            user: { id: 'u1', email: 'me@example.com', name: 'Me', emailVerified: true },
          }
        : null,
    ),
  );
}
