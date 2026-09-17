// The page's shared module: presentation metadata keyed by ApplicationStatus, plus the
// derived Active/Timeout rule. `satisfies Record<…>` makes a missing/typo'd key a compile
// error, so adding a status value forces every map here to be updated too.
import {
  type ApplicationListItem,
  type ApplicationStatus,
  type ApplicationStatusFilter,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  STATUS_FILTER_TIMEOUT,
} from './types';

export const APPLICATION_STATUS_LABELS = {
  APPLIED: 'Applied',
  RECRUITER_SCREEN: 'Recruiter screen',
  REPLIED: 'Replied',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
} satisfies Record<ApplicationStatus, string>;

/** Funnel order — lower sorts first (Offer at the top, Rejected at the bottom). */
export const APPLICATION_STATUS_ORDER = {
  OFFER: 0,
  INTERVIEW: 1,
  REPLIED: 2,
  RECRUITER_SCREEN: 3,
  APPLIED: 4,
  REJECTED: 5,
} satisfies Record<ApplicationStatus, number>;

export const APPLICATION_STATUS_BADGE_STYLES = {
  APPLIED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  RECRUITER_SCREEN: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  REPLIED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  INTERVIEW: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  OFFER: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
} satisfies Record<ApplicationStatus, string>;

/** Labels for the derived filter values. The strip's tiles and the dropdown both read
 * these, so a tile can never disagree with the dropdown entry it selects. */
export const FILTER_LABELS = {
  [STATUS_FILTER_ALL]: 'All',
  [STATUS_FILTER_ACTIVE]: 'Active',
  [STATUS_FILTER_TIMEOUT]: 'Timeout',
} as const;

export const TIMEOUT_DAYS = 30;
const MS_PER_DAY = 86_400_000;
/** Closed outcomes. An application that reached one of these isn't stuck, it's finished. */
const CLOSED_STATUSES = new Set<ApplicationStatus>(['REJECTED', 'OFFER']);

/** Days since the application last moved in the pipeline. `statusUpdatedAt` is never
 * null — it starts at `appliedAt` and updateStatus() restamps it. */
export function daysSinceLastMove(item: ApplicationListItem): number {
  return Math.floor((Date.now() - new Date(item.statusUpdatedAt).getTime()) / MS_PER_DAY);
}

/** In flight, but silent for longer than TIMEOUT_DAYS. */
export function isTimedOut(item: ApplicationListItem): boolean {
  return !CLOSED_STATUSES.has(item.status) && daysSinceLastMove(item) > TIMEOUT_DAYS;
}

/** In flight and still moving. With isTimedOut and the closed statuses this partitions
 * the log: total = active + timeout + rejected + offer. */
export function isActive(item: ApplicationListItem): boolean {
  return !CLOSED_STATUSES.has(item.status) && !isTimedOut(item);
}

export function matchesFilter(item: ApplicationListItem, filter: ApplicationStatusFilter): boolean {
  if (filter === STATUS_FILTER_ALL) return true;
  if (filter === STATUS_FILTER_ACTIVE) return isActive(item);
  if (filter === STATUS_FILTER_TIMEOUT) return isTimedOut(item);
  return item.status === filter;
}
