import type { ReactNode } from 'react';
import { Card } from './Card';

/** A list page's card (/vacancies, /applications, /inbox): it fills the view down to the
 * window's bottom, `toolbar` on top — no head, the page's title is the shell's — and
 * `children` (the list, a virtualized `Table` taking what is left) under it. */
export function ListFrame({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2.5 px-4.5 pt-3 pb-2.5">{toolbar}</div>
      {children}
    </Card>
  );
}

/** The toolbar's count. `total` is the server's count of the matches; the loaded rows
 * catch up with it as the table scrolls. */
export function ListCount({ shown, total }: { shown: number; total: number }) {
  return (
    <span className="whitespace-nowrap text-sm text-ink-muted">
      Showing {shown} of {total}
    </span>
  );
}
