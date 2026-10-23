import type { CSSProperties } from 'react';

/** A loading bar in the shape of what loads. Sized by the caller's `className` (it has
 * no height of its own, so no two heights compete). Decoration only: what a screen
 * reader hears is the `sr-only` "Loading…" beside it. */
export function Skeleton({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={`block animate-shimmer rounded-sm bg-linear-90/srgb from-surface-sunken from-25% via-surface-alt via-50% to-surface-sunken to-75% bg-size-[200%_100%] motion-reduce:animate-none ${className}`}
      style={style}
    />
  );
}
