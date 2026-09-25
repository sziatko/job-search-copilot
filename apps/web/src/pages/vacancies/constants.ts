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

/** The Status column's tags. Variants name the `.tag.*` classes in index.css;
 * `text` reuses the dropdown's labels so a tag can never disagree with the filter
 * entry that selects the same state. */
export const USER_ACTION_TAGS = {
  NOT_REVIEWED: { text: USER_ACTION_LABELS.NOT_REVIEWED, variant: 'neutral' },
  READY_TO_APPLY: { text: USER_ACTION_LABELS.READY_TO_APPLY, variant: 'accent' },
  APPLIED: { text: USER_ACTION_LABELS.APPLIED, variant: 'good' },
  DECLINED: { text: USER_ACTION_LABELS.DECLINED, variant: 'bad' },
} satisfies Record<UserAction, { text: string; variant: string }>;

/** Where each status is controlled from in a row — the two that confirm first have a
 * button of their own, the rest live behind ⋯. Total by construction, which is the
 * point (phase 2.2, finding 14): this split used to be a literal array inside
 * `RowActionMenu` plus two literal buttons in `VacancyTable`, so a fifth status could
 * ship with no control anywhere and nothing failed. */
export const USER_ACTION_CONTROL = {
  NOT_REVIEWED: 'menu',
  READY_TO_APPLY: 'menu',
  APPLIED: 'button',
  DECLINED: 'button',
} satisfies Record<UserAction, 'button' | 'menu'>;

/** The statuses the map gives a button to. A status that *becomes* a button cannot
 * reach a `Record<ButtonStatus, …>` unseen, and one that stops being a button leaves
 * an excess key behind — the two halves of "a fifth status ships with no control". */
export type ButtonStatus = {
  [Status in UserAction]: (typeof USER_ACTION_CONTROL)[Status] extends 'button' ? Status : never;
}[UserAction];

/** The ⋯ menu's items, derived from the map so the menu can neither offer a status the
 * map gave a button nor silently drop one it was given. */
export const MENU_ACTIONS = (Object.keys(USER_ACTION_CONTROL) as UserAction[]).filter(
  (status) => USER_ACTION_CONTROL[status] === 'menu',
);

/** Analyser verdict, as the short tags the table's "Rec." column shows. The
 * mockup calls APPLY_WITH_CAVEATS "Consider" and SKIP "Pass" — those are the
 * labels it renders, and the full wording is in RECOMMENDATION_LABELS for
 * anywhere with room for it. */
export const RECOMMENDATION_TAGS = {
  APPLY: { text: 'Apply', variant: 'good' },
  APPLY_WITH_CAVEATS: { text: 'Consider', variant: 'warn' },
  SKIP: { text: 'Pass', variant: 'bad' },
} satisfies Record<Recommendation, { text: string; variant: string }>;
