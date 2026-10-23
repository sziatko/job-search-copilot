// Presentation metadata keyed by the enum types from ./types. `satisfies Record<…>`
// makes a missing/typo'd key a compile error, so adding a Recommendation / status
// value forces every map here to be updated too.
import { toast } from 'sonner';
import type { Tone } from '@/components/ui/tone';
import { APPLICATION_STATUS_LABELS } from '@/lib/applications/constants';
import type { Recommendation, VacancyStatus } from './types';

export const STATUS_LABELS = {
  NEW: 'New',
  NOT_REVIEWED: 'Not reviewed',
  SAVED_FOR_LATER: 'Saved for later',
  DECLINED: 'Declined',
  UNAVAILABLE: 'Unavailable',
  FILTERED_OUT: 'Filtered out',
  ...APPLICATION_STATUS_LABELS,
} satisfies Record<VacancyStatus, string>;

/** The toast after a status move — one wording for /vacancies, /applications and the
 * vacancy page. Called from a mutation's success, never next to `mutate()`. */
export function toastMoved(
  status: VacancyStatus,
  { title, company }: { title: string; company: string },
) {
  toast.success(`Moved to ${STATUS_LABELS[status]}`, { description: `${title} — ${company}` });
}

/** The Status column's tags — a pipeline row shows its real stage. `tone` is `Tag`'s;
 * `text` reuses the labels so a tag can never disagree with the filter entry that
 * selects the same state. */
export const STATUS_TAGS = {
  NEW: { text: STATUS_LABELS.NEW, tone: 'neutral' },
  NOT_REVIEWED: { text: STATUS_LABELS.NOT_REVIEWED, tone: 'neutral' },
  SAVED_FOR_LATER: { text: STATUS_LABELS.SAVED_FOR_LATER, tone: 'accent' },
  DECLINED: { text: STATUS_LABELS.DECLINED, tone: 'bad' },
  UNAVAILABLE: { text: STATUS_LABELS.UNAVAILABLE, tone: 'bad' },
  FILTERED_OUT: { text: STATUS_LABELS.FILTERED_OUT, tone: 'bad' },
  APPLIED: { text: STATUS_LABELS.APPLIED, tone: 'good' },
  ACTION_NEEDED: { text: STATUS_LABELS.ACTION_NEEDED, tone: 'good' },
  INTERVIEW: { text: STATUS_LABELS.INTERVIEW, tone: 'good' },
  AWAITING: { text: STATUS_LABELS.AWAITING, tone: 'good' },
  OFFER: { text: STATUS_LABELS.OFFER, tone: 'good' },
  REJECTED: { text: STATUS_LABELS.REJECTED, tone: 'bad' },
} satisfies Record<VacancyStatus, { text: string; tone: Tone }>;

/** Analyser verdict, as the short tags the table's "Rec." column shows. The
 * mockup calls APPLY_WITH_CAVEATS "Consider" and SKIP "Pass" — those are the
 * labels it renders. */
export const RECOMMENDATION_TAGS = {
  APPLY: { text: 'Apply', tone: 'good' },
  APPLY_WITH_CAVEATS: { text: 'Consider', tone: 'warn' },
  SKIP: { text: 'Pass', tone: 'bad' },
} satisfies Record<Recommendation, { text: string; tone: Tone }>;
