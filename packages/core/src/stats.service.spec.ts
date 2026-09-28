import type { VacancyStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { getPrisma } from './prisma-client';
import { StatsService } from './stats.service';
import { TIMEOUT_DAYS, writeStatus } from './status';
import { VacancyService } from './vacancy.service';
import { VacancyLogService } from './vacancy-log.service';

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
    analysed = true,
    recommendation = 'APPLY',
  }: { lastMoveAt?: Date; analysed?: boolean; recommendation?: string } = {},
) {
  urlSeq += 1;
  const { vacancy } = await vacancies.save({
    company: `Company ${urlSeq}`,
    title: 'Engineer',
    applyUrl: `https://example.com/stats/${urlSeq}`,
    fullText: 'Text.',
    matchScore: 80,
    recommendation,
    estimationComment: analysed ? 'Strong match.' : '',
  });
  await prisma.$transaction(async (tx) => {
    for (const [i, status] of statuses.entries()) {
      // Each earlier move a minute before the next, so the journal's order is fixed.
      const at = new Date(lastMoveAt.getTime() - (statuses.length - 1 - i) * MINUTE);
      await writeStatus(tx, vacancy.id, status, at);
    }
  });
  return vacancy.id;
}

describe('StatsService.get', () => {
  it('is all zeros on an empty database', async () => {
    expect(await stats.get(NOW)).toEqual({
      logged: 0,
      analysed: 0,
      awaitingTriage: 0,
      recommended: 0,
      applied: 0,
      responded: 0,
      interview: 0,
      recruiterScreen: 0,
      pipeline: {
        byStatus: {
          APPLIED: 0,
          RECRUITER_SCREEN: 0,
          REPLIED: 0,
          INTERVIEW: 0,
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

  it('counts the log, the analysed (an ANALYZER comment), triage and the recommended', async () => {
    await new VacancyLogService().checkMany([
      { url: 'https://a.com/1' },
      { url: 'https://a.com/2' },
    ]);
    await seed([], { recommendation: 'APPLY' });
    await seed([], { recommendation: 'APPLY_WITH_CAVEATS', analysed: false });
    await seed(['DECLINED'], { recommendation: 'SKIP' });

    const result = await stats.get(NOW);

    expect(result).toMatchObject({ logged: 2, analysed: 2, awaitingTriage: 2, recommended: 2 });
  });

  it('counts a funnel stage from the journal: a reply then a rejection still responded', async () => {
    // ADR-0031's guard: counted from the current status, this vacancy would drop out
    // of "responded" the moment the company said no.
    await seed(['APPLIED', 'REPLIED', 'REJECTED']);
    await seed(['APPLIED', 'INTERVIEW', 'REJECTED']);
    await seed(['APPLIED']);
    await seed(['SAVED_FOR_LATER']);

    const result = await stats.get(NOW);

    expect(result).toMatchObject({ applied: 3, responded: 2, interview: 1 });
    expect(result.pipeline.byStatus).toMatchObject({ APPLIED: 1, REJECTED: 2, REPLIED: 0 });
  });

  it('counts a vacancy once per stage, however many rounds it went through', async () => {
    await seed(['APPLIED', 'INTERVIEW', 'INTERVIEW', 'OFFER']);

    expect(await stats.get(NOW)).toMatchObject({ applied: 1, responded: 1, interview: 1 });
  });

  it('times out an open row at the 30-day boundary, never a closed one', async () => {
    const cutoff = NOW.getTime() - TIMEOUT_DAYS * DAY;
    await seed(['APPLIED'], { lastMoveAt: new Date(cutoff + MINUTE) }); // active
    await seed(['APPLIED'], { lastMoveAt: new Date(cutoff - MINUTE) }); // timed out
    await seed(['APPLIED', 'RECRUITER_SCREEN'], { lastMoveAt: new Date(cutoff - DAY) }); // timed out
    await seed(['APPLIED', 'REJECTED'], { lastMoveAt: new Date(cutoff - DAY) }); // closed
    await seed(['APPLIED', 'OFFER'], { lastMoveAt: new Date(cutoff - DAY) }); // closed

    const { pipeline, recruiterScreen } = await stats.get(NOW);

    expect(pipeline).toMatchObject({ active: 1, timedOut: 2, total: 5 });
    // The partition: every pipeline row is active, timed out, rejected or an offer.
    expect(pipeline.total).toBe(
      pipeline.active + pipeline.timedOut + pipeline.byStatus.REJECTED + pipeline.byStatus.OFFER,
    );
    expect(recruiterScreen).toBe(1);
  });

  it('lists the six latest pipeline moves, newest first, with company and title', async () => {
    const id = await seed(['APPLIED', 'REPLIED', 'INTERVIEW'], { lastMoveAt: NOW });
    for (let i = 1; i <= 4; i += 1) {
      await seed(['APPLIED'], { lastMoveAt: new Date(NOW.getTime() - i * DAY) });
    }

    const { recent } = await stats.get(NOW);

    // Triage rows (every vacancy's first NOT_REVIEWED) are not activity.
    expect(recent.map((row) => row.status)).toEqual([
      'INTERVIEW',
      'REPLIED',
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
