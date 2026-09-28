import type { Prisma, VacancyStatus } from '@prisma/client';

/** The statuses /applications shows: the vacancy has been applied to. Everything before
 * is triage. */
export const PIPELINE_STATUSES = [
  'APPLIED',
  'RECRUITER_SCREEN',
  'REPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
] as const satisfies readonly VacancyStatus[];

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** A new vacancy's journal: NOT_REVIEWED (the column's default), dated `at` along with
 * `statusChangedAt`. Explicit, not `now()`: `record` takes `at` before it creates a
 * placeholder, and its APPLIED dated `at` must not sort before this row. */
export function firstStatus(at: Date) {
  return {
    statusChangedAt: at,
    statusChanges: { create: { status: 'NOT_REVIEWED', createdAt: at } },
  } as const;
}

/**
 * The only writer of `Vacancy.status`. Moves the vacancy to `status` and journals it
 * (a `StatusChange` dated `at`). Every call is an event — the status the vacancy already
 * has is journaled too and moves `statusChangedAt` (the next interview round is
 * INTERVIEW again), so a caller writes once per real event. An unknown id writes
 * nothing. Two writes, so `tx` must be a transaction — the caller's, which its other
 * writes share.
 */
export async function writeStatus(
  tx: Prisma.TransactionClient,
  vacancyId: number,
  status: VacancyStatus,
  at = new Date(),
): Promise<void> {
  const { count } = await tx.vacancy.updateMany({
    where: { id: vacancyId },
    data: { status, statusChangedAt: at },
  });
  if (count > 0) {
    await tx.statusChange.create({ data: { vacancyId, status, createdAt: at } });
  }
}
