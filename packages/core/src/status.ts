import type { CommentSource, Prisma, Recommendation, VacancyStatus } from '@prisma/client';
import { AnalysedNotNewError, SameStatusError } from './errors';

/** The statuses before the pipeline: the analysis queue (NEW), the user's triage, and
 * FILTERED_OUT. A repeat of one carries no event, so writeStatus refuses it (ADR-0029). */
export const TRIAGE_STATUSES = [
  'NEW',
  'NOT_REVIEWED',
  'SAVED_FOR_LATER',
  'DECLINED',
  'UNAVAILABLE',
  'FILTERED_OUT',
] as const satisfies readonly VacancyStatus[];

/** Where an analysis moves a vacancy out of NEW (ADR-0033) — the one status move the
 * analyzer makes, and only from NEW. */
export function statusAfterAnalysis(recommendation: Recommendation): VacancyStatus {
  return recommendation === 'SKIP' ? 'FILTERED_OUT' : 'NOT_REVIEWED';
}

/** The statuses /applications shows: the vacancy has been applied to. Everything before
 * is triage. */
export const PIPELINE_STATUSES = [
  'APPLIED',
  'RECRUITER_SCREEN',
  'REPLIED',
  'INTERVIEW',
  'AWAITING',
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

/** A nested write that adds `body` to the vacancy as a `source` comment; nothing when
 * it is blank. Rides along with a status move, in the same transaction. */
export function commentOn(
  body: string | null | undefined,
  source: CommentSource,
): Prisma.VacancyUpdateInput {
  const note = body?.trim();
  return note ? { comments: { create: { body: note, source } } } : {};
}

/** A new vacancy's journal: NEW (the column's default), dated `at` along with
 * `statusChangedAt` — every path, so every journal starts with the date the vacancy came
 * in (ADR-0033). Explicit, not `now()`: `record` takes `at` before it creates a
 * placeholder, and its APPLIED dated `at` must not sort before this row. */
export function firstStatus(at: Date) {
  return {
    statusChangedAt: at,
    statusChanges: { create: { status: 'NEW', createdAt: at } },
  } as const;
}

/**
 * The only writer of `Vacancy.status`. Moves the vacancy to `status` and journals it
 * (a `StatusChange` dated `at`). A pipeline status is always an event — the one the
 * vacancy already has is journaled too and moves `statusChangedAt` (the next interview
 * round is INTERVIEW again), so a caller writes once per real event. A triage status the
 * vacancy already has carries no event: it throws SameStatusError and writes nothing.
 * NEW on an analysed vacancy throws AnalysedNotNewError — the CHECK would refuse it as
 * a 500. An unknown id writes nothing. Two writes, so `tx` must be a transaction — the
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
    where: {
      id: vacancyId,
      ...(triage && { status: { not: status } }),
      ...(status === 'NEW' && { recommendation: null }),
    },
    data: { status, statusChangedAt: at },
  });
  if (count > 0) {
    await tx.statusChange.create({ data: { vacancyId, status, createdAt: at } });
    return;
  }
  if (!triage) return;
  const row = await tx.vacancy.findUnique({ where: { id: vacancyId }, select: { status: true } });
  if (!row) return;
  if (row.status === status) throw new SameStatusError(`Vacancy ${vacancyId} is already ${status}`);
  // The one other triage miss: NEW on a row that has an analysis.
  throw new AnalysedNotNewError(
    `Vacancy ${vacancyId} has an analysis, so it cannot go back to NEW`,
  );
}
