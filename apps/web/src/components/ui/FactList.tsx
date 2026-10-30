import type { HTMLAttributes, ReactNode } from 'react';

/** A card's label–value rows, edge to edge under its head. */
export function FactList(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="flex flex-col" {...props} />;
}

/** One row of a `FactList`, whatever it holds — a skeleton's bars, say. `py-3`, not the
 * even `py-2`: the dashboard's review queue scrolls to the height of the column these
 * rows fill, and keeps its ten rows in view only at this height. */
export function FactRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 text-small last:border-b-0"
      data-testid="fact-row"
    >
      {children}
    </div>
  );
}

/** A `FactRow` of a muted label and its value. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FactRow>
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-semibold text-ink">{children}</span>
    </FactRow>
  );
}
