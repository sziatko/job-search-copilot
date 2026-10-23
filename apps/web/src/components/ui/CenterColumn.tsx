import type { HTMLAttributes } from 'react';

/**
 * A narrow centred column: the sign-in and consent screens, a feature still to come.
 * Its `h2` and `p` children take its type; a `role="alert"` paragraph keeps its own
 * colour (`text-bad`), which the muted one would otherwise outrank.
 */
export function CenterColumn({
  as: Element = 'div',
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'main' }) {
  return (
    <Element
      className="mx-auto flex max-w-105 flex-col items-center gap-3.5 px-5 py-17.5 text-center [&>h2]:text-2xl [&>h2]:font-bold [&>p]:text-base [&>p]:leading-5 [&>p:not([role=alert])]:text-ink-muted"
      {...props}
    />
  );
}
