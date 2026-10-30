import type { ComponentProps } from 'react';

const TEXT = 'rounded-md border px-4 py-2 text-body';
const ICON =
  'relative inline-flex size-7.5 items-center justify-center rounded-md border border-border-strong bg-surface text-ink-muted disabled:opacity-50 [&_svg]:size-3.5';

/**
 * The looks a button comes in. `text-bg` on a filled one is the inversion the mockup's
 * copied flag already uses: --color-accent is dark in the light theme and light in the
 * dark one, so a fixed white or black label would fail contrast in one of them. An
 * icon button is labelled by its `Tip` (and `aria-label` where the bubble is
 * not the name), which it is the positioning box for.
 */
const VARIANTS = {
  secondary: `${TEXT} border-border-strong bg-surface text-ink hover:bg-surface-alt`,
  primary: `${TEXT} border-transparent bg-accent text-bg hover:bg-accent-ink`,
  danger: `${TEXT} border-transparent bg-bad text-bg hover:bg-bad-ink`,
  /** Text only, for a toggle inside other text ("Show more"). */
  ghost: 'pt-1 text-small text-accent',
  icon: `${ICON} hover:border-accent-soft-border hover:bg-accent-soft hover:text-accent-ink`,
  /** Keeps the red on hover: turning accent would read as harmless on the one
   * control in a row that is not. */
  iconDanger: `${ICON} hover:border-bad-soft-border hover:bg-bad-soft hover:text-bad-ink`,
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

/** The classes of a button's look, for a link that has to look like one. */
export function buttonClass(variant: ButtonVariant = 'secondary', className = '') {
  return `cursor-pointer font-bold ${VARIANTS[variant]} ${className}`;
}

/** A `<button>`, `type="button"` unless told otherwise — a bare one inside a form
 * would submit it. */
export function Button({
  variant,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
