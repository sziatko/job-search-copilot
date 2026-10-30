import type { HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLElement>;

/** A raised panel. A `section` when it is a region of its own (named by its title
 * through `aria-labelledby`), a `div` otherwise. */
export function Card({
  as: Element = 'div',
  className = '',
  ...props
}: Props & { as?: 'div' | 'section' }) {
  return (
    <Element
      className={`rounded-xl border border-border bg-surface shadow-card ${className}`}
      {...props}
    />
  );
}

/** A card's top row: its title (and sub-line) on the left, whatever else on the right. */
export function CardHead({ className = '', ...props }: Props) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 ${className}`}
      {...props}
    />
  );
}

/** The card's heading; its `id` is what a section card's `aria-labelledby` names. */
export function CardTitle(props: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className="text-title" {...props} />;
}

/** The muted line under or beside a card's title: a count, what the card shows. */
export function CardSub(props: Props) {
  return <div className="text-small text-ink-muted" {...props} />;
}
