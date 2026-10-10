import { VacancyStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ApplicationService } from '../application.service';
import { createPrismaClient, getPrisma } from '../prisma-client';
import { OPEN_PIPELINE_STATUSES } from '../status';
import { SEED_VACANCIES } from './data';
import { resetToSeed } from './reset-to-seed';

const prisma = getPrisma();

async function counts() {
  const [byStatus, comments, changes, timedOut] = await Promise.all([
    prisma.vacancy.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
    prisma.comment.groupBy({ by: ['source'], _count: true, orderBy: { source: 'asc' } }),
    prisma.statusChange.count(),
    new ApplicationService(prisma).list({ state: 'timedOut' }),
  ]);
  return { byStatus, comments, changes, timedOut: timedOut.total };
}

describe('resetToSeed', () => {
  it('makes the database the seed, the same on a second run', async () => {
    await prisma.vacancy.create({
      data: { company: 'Leftover Co', title: 'Dev', applyUrl: 'https://example.com/leftover' },
    });

    await resetToSeed(prisma);
    const first = await counts();
    await resetToSeed(prisma);

    expect(await counts()).toEqual(first);
    expect(await prisma.vacancy.count()).toBe(SEED_VACANCIES.length);
    expect(SEED_VACANCIES.length).toBeGreaterThan(100);
    expect(first.byStatus.map((row) => row.status)).toEqual(Object.values(VacancyStatus));
    expect(first.comments.map((row) => row.source)).toEqual(['ANALYZER', 'USER', 'AGENT']);
    // The dates are relative to now: the timeout rule finds exactly the seed's old rows.
    const open = OPEN_PIPELINE_STATUSES as readonly VacancyStatus[];
    expect(first.timedOut).toBe(
      SEED_VACANCIES.filter((v) => open.includes(v.moves.at(-1)?.to ?? 'NEW') && v.daysAgo > 30)
        .length,
    );
    // Each vacancy's date is its journal's last.
    const [{ stale }] = await prisma.$queryRaw<{ stale: number }[]>`
      SELECT count(*)::int AS stale FROM "Vacancy" v
      WHERE v."statusChangedAt" <> (SELECT max("createdAt") FROM "StatusChange" s WHERE s."vacancyId" = v.id)`;
    expect(stale).toBe(0);
  }, 120_000);

  it('refuses a database whose name does not end in _e2e, _test or _demo', async () => {
    const url = new URL(process.env.DATABASE_URL as string);
    url.pathname = '/postgres';
    const other = createPrismaClient(url.toString());
    try {
      await expect(resetToSeed(other)).rejects.toThrow('resetToSeed refuses "postgres"');
    } finally {
      await other.$disconnect();
    }
  });
});
