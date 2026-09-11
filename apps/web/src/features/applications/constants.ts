// Presentation metadata keyed by ApplicationStatus. `satisfies Record<…>` makes a
// missing/typo'd key a compile error, so adding a status value forces every map here
// to be updated too.
import type { ApplicationStatus } from './types';

export const APPLICATION_STATUS_LABELS = {
  APPLIED: 'Applied',
  RECRUITER_SCREEN: 'Recruiter screen',
  REPLIED: 'Replied',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  NO_RESPONSE: 'No response',
} satisfies Record<ApplicationStatus, string>;

/** Funnel order — lower sorts first (Offer at the top, Rejected at the bottom). */
export const APPLICATION_STATUS_ORDER = {
  OFFER: 0,
  INTERVIEW: 1,
  REPLIED: 2,
  RECRUITER_SCREEN: 3,
  APPLIED: 4,
  NO_RESPONSE: 5,
  REJECTED: 6,
} satisfies Record<ApplicationStatus, number>;

export const APPLICATION_STATUS_BADGE_STYLES = {
  APPLIED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  RECRUITER_SCREEN: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  REPLIED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  INTERVIEW: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  OFFER: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
  NO_RESPONSE: 'bg-amber-50 text-amber-700 ring-amber-600/20',
} satisfies Record<ApplicationStatus, string>;
