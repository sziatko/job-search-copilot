import type { Prisma, VacancyStatus } from '@prisma/client';
import { SameStatusError } from './errors';

/** The statuses before the pipeline: the user's triage. A repeat of one carries no
 * event, so writeStatus refuses it (ADR-0029). */
export const TRIAGE_STATUSES = [
  'NOT_REVIEWED',
  'SAVED_FOR_LATER',
  'DECLINED',
  'UNAVAILABLE',
] as const satisfies readonly VacancyStatus[];

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

/**
 * The timeout rule (ADR-0022, ADR-0031) — derived, and in this one place. REJECTED and
 * OFFER are closed; any other pipeline row whose last move is more than TIMEOUT_DAYS
 * before `now` is timed out, and the rest is active. So the pipeline partitions:
 * total = active + timedOut + REJECTED + OFFER.
 */
export const TIMEOUT_DAYS = 30;

/** In the pipeline and not closed — what can time out. */
export const OPEN_PIPELINE_STATUSES = PIPELINE_STATUSES.filter(
  (status) => status !== 'REJECTED' && status !== 'OFFER',
);

function timeoutCutoff(now: Date): Date {
  return new Date(now.getTime() - TIMEOUT_DAYS * 86_400_000);
}

/** The rule as a `where`: open, and not moved since `now − TIMEOUT_DAYS`. */
export function timedOutWhere(now: Date): Prisma.VacancyWhereInput {
  return { status: { in: OPEN_PIPELINE_STATUSES }, statusChangedAt: { lt: timeoutCutoff(now) } };
}

/** Its complement among the open rows: open, and moved since `now − TIMEOUT_DAYS`. */
export function activeWhere(now: Date): Prisma.VacancyWhereInput {
  return { status: { in: OPEN_PIPELINE_STATUSES }, statusChangedAt: { gte: timeoutCutoff(now) } };
}

/** The same rule for one row already read — an `/applications` item's `timedOut`. */
export function isTimedOut(status: VacancyStatus, statusChangedAt: Date, now: Date): boolean {
  return (
    (OPEN_PIPELINE_STATUSES as readonly VacancyStatus[]).includes(status) &&
    statusChangedAt < timeoutCutoff(now)
  );
}

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
 * (a `StatusChange` dated `at`). A pipeline status is always an event — the one the
 * vacancy already has is journaled too and moves `statusChangedAt` (the next interview
 * round is INTERVIEW again), so a caller writes once per real event. A triage status the
 * vacancy already has carries no event: it throws SameStatusError and writes nothing.
 * An unknown id writes nothing. Two writes, so `tx` must be a transaction — the
 * caller's, which its other writes share.
 */
export async function writeStatus(
  tx: Prisma.TransactionClient,
  vacancyId: number,
  status: VacancyStatus,
  at = new Date(),
): Promise<void> {
  const triage = (TRIAGE_STATUSES as readonly VacancyStatus[]).includes(status);
  const { count } = await tx.vacancy.updateMany({
    where: triage ? { id: vacancyId, status: { not: status } } : { id: vacancyId },
    data: { status, statusChangedAt: at },
  });
  if (count > 0) {
    await tx.statusChange.create({ data: { vacancyId, status, createdAt: at } });
  } else if (triage && (await tx.vacancy.count({ where: { id: vacancyId } })) > 0) {
    throw new SameStatusError(`Vacancy ${vacancyId} is already ${status}`);
  }
}
