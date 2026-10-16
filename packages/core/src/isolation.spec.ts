import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../tests/user';
import { ApplicationService } from './applications/application.service';
import { getPrisma } from './db/prisma-client';
import { VacancyNotFoundError } from './domain/errors';
import { VacancyIntakeService } from './intake/vacancy-intake.service';
import { StatsService } from './stats/stats.service';
import { VacancyService } from './vacancies/vacancy.service';
import type { SaveVacancyInput } from './vacancies/vacancy.types';

// ADR-0038: user B, handed user A's ids and data, finds nothing of A's and
// changes nothing of A's.
const prisma = getPrisma();
const vacancies = new VacancyService();
const applications = new ApplicationService();
const intake = new VacancyIntakeService();
const stats = new StatsService();

const analysis = { matchScore: 80, recommendation: 'APPLY', estimationComment: 'Good.' };

function posting(applyUrl: string, title: string): SaveVacancyInput {
  return { company: 'Acme', title, applyUrl, fullText: 'Text.', ...analysis };
}

let a: string;
let b: string;
/** A's vacancies: one NEW (intake), one analysed, one applied to. */
const ids = { queued: 0, analysed: 0, applied: 0 };
const QUEUED_URL = 'https://example.com/a/queued';
const ANALYSED_URL = 'https://example.com/a/analysed';

/** Everything A owns, comments and journal included. */
function snapshotOfA() {
  return prisma.vacancy.findMany({
    where: { userId: a },
    include: { comments: true, statusChanges: true },
    orderBy: { id: 'asc' },
  });
}

let before: Awaited<ReturnType<typeof snapshotOfA>>;
beforeEach(async () => {
  a = await createUser();
  b = await createUser();
  await intake.intake(a, { url: QUEUED_URL, company: 'Acme', title: 'Frontend Dev' });
  ids.queued = (await vacancies.list(a, { applyUrl: QUEUED_URL })).items[0].id;
  ids.analysed = (await vacancies.save(a, posting(ANALYSED_URL, 'Backend Dev'))).vacancy.id;
  ids.applied = (
    await vacancies.save(a, posting('https://example.com/a/applied', 'QA Lead'))
  ).vacancy.id;
  await applications.record(a, { vacancyId: ids.applied, comment: 'Applied.' });
  before = await snapshotOfA();
});

/** Each public method, as B, against A's ids and data. */
const cases: [string, () => Promise<unknown>][] = [
  [
    'VacancyService.getById',
    async () => expect(await vacancies.getById(b, ids.analysed)).toBeNull(),
  ],
  [
    'VacancyService.updateStatus',
    () =>
      expect(vacancies.updateStatus(b, ids.analysed, 'DECLINED', 'No.')).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      ),
  ],
  [
    'VacancyService.submitAnalysis — a NEW row of A',
    () =>
      expect(vacancies.submitAnalysis(b, { id: ids.queued, ...analysis })).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      ),
  ],
  [
    'VacancyService.submitAnalysis — an analysed row of A is not found, not "already analysed"',
    () =>
      expect(vacancies.submitAnalysis(b, { id: ids.analysed, ...analysis })).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      ),
  ],
  [
    'VacancyService.submitAnalyses',
    () =>
      expect(vacancies.submitAnalyses(b, [{ id: ids.queued, ...analysis }])).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      ),
  ],
  [
    "VacancyService.save — A's applyUrl creates B's own row",
    async () =>
      expect(await vacancies.save(b, posting(ANALYSED_URL, 'Backend Dev'))).toMatchObject({
        created: true,
        vacancy: { userId: b },
      }),
  ],
  [
    "VacancyService.saveMany — A's NEW row is not B's to attach to",
    async () =>
      expect(
        (await vacancies.saveMany(b, [posting(QUEUED_URL, 'Frontend Dev')])).results[0],
      ).toMatchObject({ created: true, attached: false, vacancy: { userId: b } }),
  ],
  [
    'VacancyService.list',
    async () =>
      expect(await vacancies.list(b, { sameCompanyAs: 'Acme' })).toEqual({
        items: [],
        total: 0,
        nextCursor: null,
      }),
  ],
  [
    'ApplicationService.record — by id',
    () =>
      expect(applications.record(b, { vacancyId: ids.analysed })).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      ),
  ],
  [
    "ApplicationService.record — A's company and title make B a placeholder",
    async () =>
      expect(await applications.record(b, { company: 'Acme', title: 'Backend Dev' })).toMatchObject(
        { resolution: 'created-vacancy', vacancyCreated: true },
      ),
  ],
  [
    'ApplicationService.recordMany',
    () =>
      expect(applications.recordMany(b, [{ vacancyId: ids.queued }])).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      ),
  ],
  [
    'ApplicationService.getById',
    async () => expect(await applications.getById(b, ids.applied)).toBeNull(),
  ],
  [
    'ApplicationService.list',
    async () => expect((await applications.list(b, { sameCompanyAs: 'Acme' })).total).toBe(0),
  ],
  [
    'ApplicationService.updateStatus',
    () =>
      expect(
        applications.updateStatus(b, ids.applied, 'INTERVIEW', 'Call.', 'AGENT'),
      ).rejects.toBeInstanceOf(VacancyNotFoundError),
  ],
  [
    'ApplicationService.updateStatus — a triage status',
    () =>
      expect(
        applications.updateStatus(b, ids.analysed, 'DECLINED', 'No.', 'USER'),
      ).rejects.toBeInstanceOf(VacancyNotFoundError),
  ],
  [
    'ApplicationService.update',
    () =>
      expect(
        applications.update(b, ids.applied, { salaryInApplication: '1', comment: 'Hi.' }),
      ).rejects.toBeInstanceOf(VacancyNotFoundError),
  ],
  [
    'ApplicationService.addComment',
    () =>
      expect(applications.addComment(b, ids.analysed, 'Hi.', 'AGENT')).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      ),
  ],
  [
    'ApplicationService.updateStatusByVacancy',
    () =>
      expect(
        applications.updateStatusByVacancy(b, 'Acme', 'QA Lead', 'REJECTED', 'No.', 'AGENT'),
      ).rejects.toBeInstanceOf(VacancyNotFoundError),
  ],
  [
    "VacancyIntakeService.intake — A's url is new to B",
    async () =>
      expect(
        await intake.intake(b, { url: QUEUED_URL, company: 'Acme', title: 'Frontend Dev' }),
      ).toEqual({ new: true }),
  ],
  [
    "VacancyIntakeService.intakeMany — A's company and title are no duplicate for B",
    async () =>
      expect(
        await intake.intakeMany(b, [
          { url: 'https://example.com/b/repost', company: 'ACME', title: 'Frontend Dev' },
        ]),
      ).toEqual({ new: ['https://example.com/b/repost'] }),
  ],
  [
    'StatsService.get',
    async () => expect(await stats.get(b)).toMatchObject({ logged: 0, applied: 0, recent: [] }),
  ],
];

describe("user B and user A's data", () => {
  it.each(cases)('%s', async (_, run) => {
    await run();
    expect(await snapshotOfA()).toEqual(before);
  });

  it('keeps one applyUrl as two rows, one per user', async () => {
    await vacancies.save(b, posting(ANALYSED_URL, 'Backend Dev'));
    const rows = await prisma.vacancy.findMany({ where: { applyUrl: ANALYSED_URL } });
    expect(rows.map((row) => row.userId).sort()).toEqual([a, b].sort());
  });

  it("counts only B's own rows in B's list, stats and company history", async () => {
    const mine = (await vacancies.save(b, posting('https://example.com/b/1', 'Backend Dev')))
      .vacancy;
    await applications.record(b, { vacancyId: mine.id });

    const list = await vacancies.list(b);
    expect(list.items.map((item) => [item.id, item.companyMatchCount])).toEqual([[mine.id, 1]]);
    expect((await vacancies.list(b, { sameCompanyAs: 'Acme' })).total).toBe(1);
    expect((await applications.list(b)).items.map((item) => item.companyMatchCount)).toEqual([1]);
    expect(await stats.get(b)).toMatchObject({
      logged: 1,
      applied: 1,
      recent: [{ vacancyId: mine.id }],
    });
    // And A's counts are A's: three Acme rows, B's not among them.
    expect((await vacancies.list(a, { sameCompanyAs: 'Acme' })).total).toBe(3);
    expect((await stats.get(a)).logged).toBe(3);
  });
});
