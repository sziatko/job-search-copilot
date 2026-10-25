import type { HTMLAttributes, ReactNode } from 'react';

/** A card's label–value rows, edge to edge under its head. */
export function FactList(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="flex flex-col" {...props} />;
}

/** One row of a `FactList`, whatever it holds — a skeleton's bars, say. */
export function FactRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-2.5 border-b border-border px-4.5 py-2.5 text-sm last:border-b-0"
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
