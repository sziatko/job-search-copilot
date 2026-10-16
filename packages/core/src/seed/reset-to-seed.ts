import type { PrismaClient, VacancyStatus } from '@prisma/client';
import { ApplicationService } from '../applications/application.service';
import { forUser } from '../db/for-user';
import { PIPELINE_STATUSES, statusAfterAnalysis } from '../domain/status';
import { VacancyIntakeService } from '../intake/vacancy-intake.service';
import { VacancyService } from '../vacancies/vacancy.service';
import { ANALYSIS_BATCH_MAX } from '../vacancies/vacancy.types';
import { SEED_VACANCIES } from './data';

const DAY = 86_400_000;
const MINUTE = 60_000;

/** The databases a reset may wipe. The dev DB holds real data and has none of these. */
const DISPOSABLE_DB = /_(e2e|test|demo)$/;

/**
 * Makes `userId`'s data the seed (ADR-0037): deletes that user's vacancies, then writes
 * SEED_VACANCIES through the services as that user, so the journal and the comments are
 * the ones the app itself writes. Users, sessions and other users' vacancies are left
 * alone. Then every date is moved back
 * relative to `now` — the last move `daysAgo` days ago, one day per earlier step — so the
 * timeout rule gives the same answer on every run. `now` is a parameter so the visual
 * tests can pin it (`e2e/clock.ts`). Refuses, before any write, a database whose name
 * (asked of the connection itself) does not end in `_e2e`, `_test` or `_demo`.
 */
export async function resetToSeed(
  prisma: PrismaClient,
  userId: string,
  now = new Date(),
): Promise<void> {
  const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!DISPOSABLE_DB.test(name)) {
    throw new Error(`resetToSeed refuses "${name}": only a *_e2e, *_test or *_demo database`);
  }

  const db = forUser(prisma, userId);
  await db.vacancy.deleteMany();
  const vacancies = new VacancyService(prisma);
  const applications = new ApplicationService(prisma);
  await new VacancyIntakeService(prisma).intakeMany(
    userId,
    SEED_VACANCIES.map((v) => ({
      url: v.applyUrl,
      company: v.company,
      title: v.title,
      source: v.source,
      fullText: v.fullText,
    })),
  );
  // Created in seed order on an emptied table, so ids follow it.
  const ids = (await db.vacancy.findMany({ orderBy: { id: 'asc' }, select: { id: true } })).map(
    (row) => row.id,
  );

  // Per vacancy: its journal, and the journal step each comment was written at.
  const journals: VacancyStatus[][] = SEED_VACANCIES.map(() => ['NEW']);
  const noteSteps: number[][] = SEED_VACANCIES.map(() => []);
  const record = (i: number, status: VacancyStatus, note?: string) => {
    journals[i].push(status);
    if (note) noteSteps[i].push(journals[i].length - 1);
  };

  const analysed = SEED_VACANCIES.flatMap((v, i) => (v.analysis ? [{ i, ...v.analysis }] : []));
  for (let start = 0; start < analysed.length; start += ANALYSIS_BATCH_MAX) {
    const batch = analysed.slice(start, start + ANALYSIS_BATCH_MAX);
    await vacancies.submitAnalyses(
      userId,
      batch.map(({ i, comment, ...analysis }) => ({
        id: ids[i],
        ...analysis,
        estimationComment: comment,
      })),
    );
    for (const { i, recommendation, comment } of batch) {
      record(i, statusAfterAnalysis(recommendation), comment);
    }
  }

  for (const [i, v] of SEED_VACANCIES.entries()) {
    for (const { to, note } of v.moves) {
      if (to === 'APPLIED') {
        await applications.record(userId, {
          vacancyId: ids[i],
          salaryInApplication: v.salary,
          usedTailoredResume: v.tailored,
          comment: note,
        });
      } else if ((PIPELINE_STATUSES as readonly VacancyStatus[]).includes(to)) {
        await applications.updateStatus(userId, ids[i], to, note, 'AGENT');
      } else {
        await vacancies.updateStatus(userId, ids[i], to, note);
      }
      record(i, to, note);
    }
  }

  const [changes, comments] = await Promise.all([
    db.statusChange.findMany({ orderBy: { id: 'asc' }, select: { id: true, vacancyId: true } }),
    db.comment.findMany({ orderBy: { id: 'asc' }, select: { id: true, vacancyId: true } }),
  ]);
  const byVacancy = (rows: { id: number; vacancyId: number }[], vacancyId: number) =>
    rows.filter((row) => row.vacancyId === vacancyId).map((row) => row.id);

  // The new dates, as (ids, dates) column pairs: three UPDATEs instead of one per row
  // (about 700, seconds against Docker on Windows). Raw SQL is outside forUser: the ids
  // were read through it, and the Vacancy UPDATE checks the owner as well.
  const dated = {
    change: { ids: [] as number[], at: [] as string[] },
    comment: { ids: [] as number[], at: [] as string[] },
    vacancy: { ids, createdAt: [] as string[], movedAt: [] as string[] },
  };
  for (const [i, v] of SEED_VACANCIES.entries()) {
    const steps = journals[i].length;
    // A minute apart per vacancy, so no two share a date.
    const at = (step: number) =>
      new Date(now.getTime() - (v.daysAgo + steps - 1 - step) * DAY - i * MINUTE).toISOString();
    for (const [step, id] of byVacancy(changes, ids[i]).entries()) {
      dated.change.ids.push(id);
      dated.change.at.push(at(step));
    }
    for (const [n, id] of byVacancy(comments, ids[i]).entries()) {
      dated.comment.ids.push(id);
      dated.comment.at.push(at(noteSteps[i][n]));
    }
    dated.vacancy.createdAt.push(at(0));
    dated.vacancy.movedAt.push(at(steps - 1));
  }
  const { change, comment, vacancy } = dated;
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "StatusChange" AS t SET "createdAt" = d.at
      FROM unnest(${change.ids}::int[], ${change.at}::timestamp(3)[]) AS d(id, at)
      WHERE t.id = d.id`,
    prisma.$executeRaw`UPDATE "Comment" AS t SET "createdAt" = d.at
      FROM unnest(${comment.ids}::int[], ${comment.at}::timestamp(3)[]) AS d(id, at)
      WHERE t.id = d.id`,
    prisma.$executeRaw`UPDATE "Vacancy" AS t SET "createdAt" = d.c, "statusChangedAt" = d.m,
        "updatedAt" = d.m
      FROM unnest(${vacancy.ids}::int[], ${vacancy.createdAt}::timestamp(3)[],
        ${vacancy.movedAt}::timestamp(3)[]) AS d(id, c, m)
      WHERE t.id = d.id AND t."userId" = ${userId}`,
  ]);
}
