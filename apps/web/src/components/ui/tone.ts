/** The tinted look of a status label — border, fill and text of one tone — shared by
 * `Tag` and `Pill`. */
export const TONE = {
  good: 'border-good-soft-border bg-good-soft text-good',
  warn: 'border-warn-soft-border bg-warn-soft text-warn',
  bad: 'border-bad-soft-border bg-bad-soft text-bad',
  neutral: 'border-border bg-surface-sunken text-ink-muted',
  accent: 'border-accent-soft-border bg-accent-soft text-accent-ink',
} as const;

export type Tone = keyof typeof TONE;
