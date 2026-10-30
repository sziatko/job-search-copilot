import type { HTMLAttributes } from 'react';

/** A line of meta beside the content — a date, a time ago, a ratio: small, monospaced,
 * faint. Secondary only: never the one place a fact is shown. As a `time`, it takes
 * the machine-readable `dateTime`. */
export function Meta({
  as: Element = 'span',
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'span' | 'div' | 'time'; dateTime?: string }) {
  return (
    <Element
      className={`font-mono text-caption tabular-nums text-ink-faint ${className}`}
      {...props}
    />
  );
}
