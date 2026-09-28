// Presentation metadata keyed by the enum types from ./types. `satisfies Record<…>`
// makes a missing/typo'd key a compile error, so adding a Recommendation / status
// value forces every map here to be updated too.
import { APPLICATION_STATUS_LABELS } from '../applications/constants';
import type { Recommendation, VacancyAction, VacancyStatus } from './types';

export const STATUS_LABELS = {
  NOT_REVIEWED: 'Not reviewed',
  SAVED_FOR_LATER: 'Saved for later',
  DECLINED: 'Declined',
  ...APPLICATION_STATUS_LABELS,
} satisfies Record<VacancyStatus, string>;

/** The Status column's tags — a pipeline row shows its real stage. Variants name the
 * `.tag.*` classes in index.css; `text` reuses the labels so a tag can never disagree
 * with the filter entry that selects the same state. */
export const STATUS_TAGS = {
  NOT_REVIEWED: { text: STATUS_LABELS.NOT_REVIEWED, variant: 'neutral' },
  SAVED_FOR_LATER: { text: STATUS_LABELS.SAVED_FOR_LATER, variant: 'accent' },
  DECLINED: { text: STATUS_LABELS.DECLINED, variant: 'bad' },
  APPLIED: { text: STATUS_LABELS.APPLIED, variant: 'good' },
  RECRUITER_SCREEN: { text: STATUS_LABELS.RECRUITER_SCREEN, variant: 'good' },
  REPLIED: { text: STATUS_LABELS.REPLIED, variant: 'good' },
  INTERVIEW: { text: STATUS_LABELS.INTERVIEW, variant: 'good' },
  OFFER: { text: STATUS_LABELS.OFFER, variant: 'good' },
  REJECTED: { text: STATUS_LABELS.REJECTED, variant: 'bad' },
} satisfies Record<VacancyStatus, { text: string; variant: string }>;

/** Where each action is controlled from in a row — the two that confirm first have a
 * button of their own, the rest live behind ⋯. Total by construction, which is the
 * point (phase 2.2, finding 14): this split used to be a literal array inside
 * `RowActionMenu` plus two literal buttons in `VacancyTable`, so a fifth status could
 * ship with no control anywhere and nothing failed. */
export const ACTION_CONTROL = {
  NOT_REVIEWED: 'menu',
  SAVED_FOR_LATER: 'menu',
  APPLIED: 'button',
  DECLINED: 'button',
} satisfies Record<VacancyAction, 'button' | 'menu'>;

/** The actions the map gives a button to. An action that *becomes* a button cannot
 * reach a `Record<ButtonStatus, …>` unseen, and one that stops being a button leaves
 * an excess key behind — the two halves of "a fifth status ships with no control". */
export type ButtonStatus = {
  [Action in VacancyAction]: (typeof ACTION_CONTROL)[Action] extends 'button' ? Action : never;
}[VacancyAction];

/** The ⋯ menu's items, derived from the map so the menu can neither offer a status the
 * map gave a button nor silently drop one it was given. */
export const MENU_ACTIONS = (Object.keys(ACTION_CONTROL) as VacancyAction[]).filter(
  (status) => ACTION_CONTROL[status] === 'menu',
);

/** Analyser verdict, as the short tags the table's "Rec." column shows. The
 * mockup calls APPLY_WITH_CAVEATS "Consider" and SKIP "Pass" — those are the
 * labels it renders. */
export const RECOMMENDATION_TAGS = {
  APPLY: { text: 'Apply', variant: 'good' },
  APPLY_WITH_CAVEATS: { text: 'Consider', variant: 'warn' },
  SKIP: { text: 'Pass', variant: 'bad' },
} satisfies Record<Recommendation, { text: string; variant: string }>;
