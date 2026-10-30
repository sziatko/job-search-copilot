/** A tone is a hue with a meaning: good news, a caution, bad news, the accent, or none.
 * Each recipe below is one way to paint it from the colour steps in index.css. */

/** A tinted label — border, fill and small text: `Tag`, `Pill`. */
export const TONE = {
  good: 'border-good-soft-border bg-good-soft text-good-ink',
  warn: 'border-warn-soft-border bg-warn-soft text-warn-ink',
  bad: 'border-bad-soft-border bg-bad-soft text-bad-ink',
  neutral: 'border-border bg-surface-sunken text-ink-muted',
  accent: 'border-accent-soft-border bg-accent-soft text-accent-ink',
} as const;

export type Tone = keyof typeof TONE;

/** A borderless badge — fill and small text. */
export const TONE_FILL = {
  good: 'bg-good-soft text-good-ink',
  warn: 'bg-warn-soft text-warn-ink',
  bad: 'bg-bad-soft text-bad-ink',
  neutral: 'bg-surface-sunken text-ink-muted',
  accent: 'bg-accent-soft text-accent-ink',
} as const satisfies Record<Tone, string>;

/** A number or a word in the hue (a KPI's value, large or as a strip's chip). */
export const TONE_TEXT = {
  good: 'text-good-ink',
  warn: 'text-warn-ink',
  bad: 'text-bad-ink',
  neutral: 'text-ink',
  accent: 'text-accent-ink',
} as const satisfies Record<Tone, string>;

/** A dot or a bar. */
export const TONE_DOT = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-border-strong',
  accent: 'bg-accent',
} as const satisfies Record<Tone, string>;
