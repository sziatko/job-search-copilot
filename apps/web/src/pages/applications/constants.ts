// The page's shared module: presentation metadata keyed by ApplicationStatus. The
// Active/Timeout rule is the server's (ADR-0031). `satisfies Record<…>` makes a
// missing/typo'd key a compile error, so adding a status value forces every map here
// to be updated too.
import {
  type ApplicationListItem,
  type ApplicationStatus,
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

/** Labels for the derived filter values. The strip's tiles and the dropdown both read
 * these, so a tile can never disagree with the dropdown entry it selects. */
export const FILTER_LABELS = {
  [STATUS_FILTER_ALL]: 'All',
  [STATUS_FILTER_ACTIVE]: 'Active',
  [STATUS_FILTER_TIMEOUT]: 'Timeout',
} as const;

const MS_PER_DAY = 86_400_000;

/** Days since the application last moved: from applying while APPLIED, from the
 * interview after INTERVIEW — the ⏳ tip's number. Whether a row *is* timed out is the
 * server's answer (`timedOut`, ADR-0031), not this. */
export function daysSinceLastMove(item: ApplicationListItem): number {
  return Math.floor((Date.now() - new Date(item.statusChangedAt).getTime()) / MS_PER_DAY);
}
