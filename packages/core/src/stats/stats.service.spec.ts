import type { VacancyStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../../tests/user';
import { forUser } from '../db/for-user';
import { getPrisma } from '../db/prisma-client';
import { TIMEOUT_DAYS, writeStatus } from '../domain/status';
import { VacancyIntakeService } from '../intake/vacancy-intake.service';
import { VacancyService } from '../vacancies/vacancy.service';
import { StatsService } from './stats.service';

/** Every call acts as this test's user (ADR-0038). */
let userId: string;
beforeEach(async () => {
  userId = await createUser();
});

// Integration tests against the real (test) Postgres — same rationale as
// vacancy.service.spec.ts.
const stats = new StatsService();
const vacancies = new VacancyService();
const prisma = getPrisma();

const NOW = new Date('2026-09-28T12:00:00.000Z');
const DAY = 86_400_000;
const MINUTE = 60_000;

let urlSeq = 0;
/** A vacancy moved through `statuses` in order, the last move dated `lastMoveAt`. */
async function seed(
  statuses: VacancyStatus[] = [],
  {
    lastMoveAt = NOW,
    recommendation = 'APPLY',
  }: { lastMoveAt?: Date; recommendation?: string } = {},
) {
  urlSeq += 1;
  const { vacancy } = await vacancies.save(userId, {
    company: `Company ${urlSeq}`,
    title: 'Engineer',
    applyUrl: `https://example.com/stats/${urlSeq}`,
    fullText: 'Text.',
    matchScore: 80,
    recommendation,
    estimationComment: 'Strong match.',
  });
  await forUser(prisma, userId).$transaction(async (db) => {
    for (const [i, status] of statuses.entries()) {
      // Each earlier move a minute before the next, so the journal's order is fixed.
      const at = new Date(lastMoveAt.getTime() - (statuses.length - 1 - i) * MINUTE);
      await writeStatus(db, vacancy.id, status, at);
    }
  });
  return vacancy.id;
}

describe('StatsService.get', () => {
  it('is all zeros on an empty database', async () => {
    expect(await stats.get(userId, NOW)).toEqual({
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
    });
  });

  it('counts every vacancy as logged, analysed or not, then triage and the recommended', async () => {
    await new VacancyIntakeService().intakeMany(userId, [
      { url: 'https://a.com/1', company: 'A', title: 'Dev' },
      { url: 'https://a.com/2', company: 'B', title: 'Dev' },
    ]);
    await seed([], { recommendation: 'APPLY' });
    await seed([], { recommendation: 'APPLY_WITH_CAVEATS' });
    await seed(['DECLINED'], { recommendation: 'SKIP' });

    const result = await stats.get(userId, NOW);

    expect(result).toMatchObject({ logged: 5, awaitingTriage: 2, recommended: 2 });
  });

  it("counts the queue, and the analyzer's no once per vacancy: FILTERED_OUT or an analysed SKIP", async () => {
    await new VacancyIntakeService().intakeMany(userId, [
      { url: 'https://a.com/1', company: 'A', title: 'Dev' },
      { url: 'https://a.com/2', company: 'B', title: 'Dev', fullText: 'Text.' },
      { url: 'https://a.com/3', company: 'C', title: 'Dev' },
    ]);
    // Filtered out by the user, never analysed.
    const { id } = await prisma.vacancy.findUniqueOrThrow({
      where: { userId_applyUrl: { userId, applyUrl: 'https://a.com/3' } },
    });
    await forUser(prisma, userId).$transaction((db) => writeStatus(db, id, 'FILTERED_OUT'));
    await seed([], { recommendation: 'SKIP' }); // FILTERED_OUT by the rule: one, not two
    await seed(['NOT_REVIEWED'], { recommendation: 'SKIP' }); // taken back: still the analyzer's no
    await seed([], { recommendation: 'APPLY' });
    await seed(['DECLINED'], { recommendation: 'APPLY_WITH_CAVEATS' });

    expect(await stats.get(userId, NOW)).toMatchObject({
      logged: 7,
      awaitingAnalysis: 2,
      notRecommended: 3,
      recommended: 2,
    });
  });

  it('counts declined by the current status only', async () => {
    await seed(['DECLINED']);
    await seed(['DECLINED', 'SAVED_FOR_LATER']); // changed their mind: not declined now
    await seed(['APPLIED', 'REJECTED']); // the company's no, not the user's
    await seed(['SAVED_FOR_LATER']);

    expect((await stats.get(userId, NOW)).declined).toBe(1);
  });

  it('counts unavailable by the current status only', async () => {
    await seed(['UNAVAILABLE']);
    await seed(['SAVED_FOR_LATER', 'UNAVAILABLE']);
    await seed(['UNAVAILABLE', 'NOT_REVIEWED']); // set back: not unavailable now
    await seed(['DECLINED']);

    expect(await stats.get(userId, NOW)).toMatchObject({ unavailable: 2, declined: 1 });
  });

  it('counts a funnel stage from the journal: a question then a rejection still responded', async () => {
    // ADR-0031's guard: counted from the current status, this vacancy would drop out
    // of "responded" the moment the company said no.
    await seed(['APPLIED', 'ACTION_NEEDED', 'REJECTED']);
    await seed(['APPLIED', 'INTERVIEW', 'REJECTED']);
    await seed(['APPLIED']);
    await seed(['SAVED_FOR_LATER']);

    const result = await stats.get(userId, NOW);

    expect(result).toMatchObject({ applied: 3, responded: 2, interview: 1 });
    expect(result.pipeline.byStatus).toMatchObject({ APPLIED: 1, REJECTED: 2, ACTION_NEEDED: 0 });
  });

  it('counts a vacancy once per stage, however many rounds it went through', async () => {
    await seed(['APPLIED', 'INTERVIEW', 'INTERVIEW', 'OFFER']);

    expect(await stats.get(userId, NOW)).toMatchObject({ applied: 1, responded: 1, interview: 1 });
  });

  it('counts AWAITING as responded, not as an interview', async () => {
    await seed(['APPLIED', 'AWAITING']); // a test task sent, waiting on their feedback
    await seed(['APPLIED']);

    const result = await stats.get(userId, NOW);

    expect(result).toMatchObject({ applied: 2, responded: 1, interview: 0 });
    expect(result.pipeline.byStatus.AWAITING).toBe(1);
  });

  it('times out an open row at the 30-day boundary, never a closed one', async () => {
    const cutoff = NOW.getTime() - TIMEOUT_DAYS * DAY;
    await seed(['APPLIED'], { lastMoveAt: new Date(cutoff + MINUTE) }); // active
    await seed(['APPLIED'], { lastMoveAt: new Date(cutoff - MINUTE) }); // timed out
    await seed(['APPLIED', 'ACTION_NEEDED'], { lastMoveAt: new Date(cutoff - DAY) }); // timed out
    await seed(['APPLIED', 'AWAITING'], { lastMoveAt: new Date(cutoff - DAY) }); // open: timed out
    await seed(['APPLIED', 'REJECTED'], { lastMoveAt: new Date(cutoff - DAY) }); // closed
    await seed(['APPLIED', 'OFFER'], { lastMoveAt: new Date(cutoff - DAY) }); // closed

    const { pipeline, actionNeeded } = await stats.get(userId, NOW);

    expect(pipeline).toMatchObject({ active: 1, timedOut: 3, total: 6 });
    // The partition: every pipeline row is active, timed out, rejected or an offer.
    expect(pipeline.total).toBe(
      pipeline.active + pipeline.timedOut + pipeline.byStatus.REJECTED + pipeline.byStatus.OFFER,
    );
    expect(actionNeeded).toBe(1);
  });

  it('lists the six latest pipeline moves, newest first, with company and title', async () => {
    const id = await seed(['APPLIED', 'ACTION_NEEDED', 'INTERVIEW'], { lastMoveAt: NOW });
    for (let i = 1; i <= 4; i += 1) {
      await seed(['APPLIED'], { lastMoveAt: new Date(NOW.getTime() - i * DAY) });
    }

    const { recent } = await stats.get(userId, NOW);

    // Triage rows (every vacancy's first NOT_REVIEWED) are not activity.
    expect(recent.map((row) => row.status)).toEqual([
      'INTERVIEW',
      'ACTION_NEEDED',
      'APPLIED',
      'APPLIED',
      'APPLIED',
      'APPLIED',
    ]);
    expect(recent[0]).toMatchObject({
      vacancyId: id,
      company: expect.stringMatching(/^Company /),
      title: 'Engineer',
      createdAt: NOW,
    });
  });
});
