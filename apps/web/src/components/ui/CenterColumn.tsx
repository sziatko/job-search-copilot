import type { HTMLAttributes } from 'react';

/**
 * A narrow centred column: the sign-in and consent screens, a feature still to come.
 * Its `h2` and `p` children take its type; a `role="alert"` paragraph keeps its own
 * colour (`text-bad-ink`), which the muted one would otherwise outrank.
 */
export function CenterColumn({
  as: Element = 'div',
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'main' }) {
  return (
    <Element
      className="mx-auto flex max-w-105 flex-col items-center gap-4 px-5 py-18 text-center [&>h2]:text-heading [&>h2]:font-bold [&>p]:text-body [&>p:not([role=alert])]:text-ink-muted"
      {...props}
    />
  );
}
