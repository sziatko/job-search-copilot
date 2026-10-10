import { PIPELINE_STATUSES, SEED_VACANCIES } from '@job-search-copilot/core';

type SeedVacancy = (typeof SEED_VACANCIES)[number];

/** A seed vacancy's status after the reset: its last move, else what its analysis made
 * of `NEW` (invariant 3). */
export function seedStatus(v: SeedVacancy): string {
  const last = v.moves.at(-1);
  if (last) return last.to;
  if (!v.analysis) return 'NEW';
  return v.analysis.recommendation === 'SKIP' ? 'FILTERED_OUT' : 'NOT_REVIEWED';
}

/** How many seed vacancies pass `predicate` — an expected count. */
export const seedCount = (predicate: (v: SeedVacancy) => boolean) =>
  SEED_VACANCIES.filter(predicate).length;

/** Is it in the pipeline, and not closed (OFFER, REJECTED) — what can time out? */
export const seedOpen = (v: SeedVacancy) =>
  (PIPELINE_STATUSES as readonly string[]).includes(seedStatus(v)) &&
  !['OFFER', 'REJECTED'].includes(seedStatus(v));

/** The timeout rule (ADR-0031): open, and not moved for over 30 days. */
export const seedTimedOut = (v: SeedVacancy) => seedOpen(v) && v.daysAgo > 30;

/** Did the vacancy's journal ever reach one of `statuses`? (The dashboard's "ever reached".) */
export const reached = (v: SeedVacancy, ...statuses: string[]) =>
  v.moves.some((m) => statuses.includes(m.to));
