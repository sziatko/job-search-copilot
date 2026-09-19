// Presentation metadata keyed by the enum types from ./types. `satisfies Record<…>`
// makes a missing/typo'd key a compile error, so adding a Recommendation / UserAction
// value forces every map here to be updated too.
import type { Recommendation, UserAction } from './types';

/** List sort priority — lower sorts first (Apply before Skip). */
export const RECOMMENDATION_ORDER = {
  APPLY: 0,
  APPLY_WITH_CAVEATS: 1,
  SKIP: 2,
} satisfies Record<Recommendation, number>;

export const RECOMMENDATION_LABELS = {
  APPLY: 'Apply',
  APPLY_WITH_CAVEATS: 'Apply with caveats',
  SKIP: 'Skip',
} satisfies Record<Recommendation, string>;

export const USER_ACTION_LABELS = {
  NOT_REVIEWED: 'Not reviewed',
  READY_TO_APPLY: 'Ready to apply',
  APPLIED: 'Applied',
  DECLINED: 'Declined',
} satisfies Record<UserAction, string>;

/** Analyser verdict, as the short tags the table's "Rec." column shows. The
 * mockup calls APPLY_WITH_CAVEATS "Consider" and SKIP "Pass" — those are the
 * labels it renders, and the full wording is in RECOMMENDATION_LABELS for
 * anywhere with room for it. */
export const RECOMMENDATION_TAGS = {
  APPLY: { text: 'Apply', variant: 'good' },
  APPLY_WITH_CAVEATS: { text: 'Consider', variant: 'warn' },
  SKIP: { text: 'Pass', variant: 'bad' },
} satisfies Record<Recommendation, { text: string; variant: string }>;
