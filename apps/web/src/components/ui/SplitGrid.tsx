import type { HTMLAttributes } from 'react';

/**
 * Two columns, the left one wider, stacked into one on a narrower screen (`stacked`).
 * `minmax(0, …)`, not a bare `fr`: a bare fr's floor is the column's min-content, and a
 * long nowrap title counts at full length there — it widened the column past the window
 * before its ellipsis could cut it.
 */
export function SplitGrid(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 stacked:grid-cols-1"
      {...props}
    />
  );
}
