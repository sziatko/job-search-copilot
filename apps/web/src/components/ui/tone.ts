/** A tone is a hue with a meaning: good news, a caution, bad news, the accent, or none.
 * Each recipe below is one way to paint it from the colour steps in index.css. */

/** A tinted label — border, fill and small text: `Tag`, `Pill`. */
export const TONE = {
  good: 'border-good-soft-border bg-good-soft text-good-ink',
  warn: 'border-warn-soft-border bg-warn-soft text-warn-ink',
  bad: 'border-bad-soft-border bg-bad-soft text-bad-ink',
  neutral: 'border-grey-soft-border bg-grey-soft text-grey-ink',
  accent: 'border-accent-soft-border bg-accent-soft text-accent-ink',
} as const;

export type Tone = keyof typeof TONE;

/** A borderless badge — fill and small text. */
export const TONE_FILL = {
  good: 'bg-good-soft text-good-ink',
  warn: 'bg-warn-soft text-warn-ink',
  bad: 'bg-bad-soft text-bad-ink',
  neutral: 'bg-grey-soft text-grey-ink',
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

/** A tinted label in a colour with no meaning of its own, for a label the user owns: `Chip`.
 * A status takes a `Tone`, so it cannot take one of these. */
export const CHIP_COLOR = {
  grey: 'border-grey-soft-border bg-grey-soft text-grey-ink',
  green: 'border-green-soft-border bg-green-soft text-green-ink',
  amber: 'border-amber-soft-border bg-amber-soft text-amber-ink',
  red: 'border-red-soft-border bg-red-soft text-red-ink',
  blue: 'border-blue-soft-border bg-blue-soft text-blue-ink',
  teal: 'border-teal-soft-border bg-teal-soft text-teal-ink',
  violet: 'border-violet-soft-border bg-violet-soft text-violet-ink',
  pink: 'border-pink-soft-border bg-pink-soft text-pink-ink',
  orange: 'border-orange-soft-border bg-orange-soft text-orange-ink',
  lime: 'border-lime-soft-border bg-lime-soft text-lime-ink',
} as const;

export type ChipColor = keyof typeof CHIP_COLOR;
