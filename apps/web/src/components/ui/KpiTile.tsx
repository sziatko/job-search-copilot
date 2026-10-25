import type { HTMLAttributes } from 'react';
import { Skeleton } from './Skeleton';

/** The value's colour, by what the number means. */
const VALUE_TONE = {
  accent: 'text-accent-ink',
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
} as const;

/** A row of `KpiTile`s: a grid that fits as many as the width takes (two on a narrow
 * screen) — and, on the table pages, the `strip` of chips. */
export function KpiRow(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 narrow:grid-cols-2 strip:flex strip:gap-2 strip:overflow-x-auto"
      {...props}
    />
  );
}

const BOX =
  'rounded-lg border px-4 py-3.5 text-left shadow-card strip:flex strip:flex-none strip:items-baseline strip:gap-1.5 strip:rounded-full strip:px-3 strip:py-1.25';

/**
 * A summary tile. The mockup draws these as inert <div>s; ours double as quick
 * filters, so they render as buttons when given an onClick and get a `selected`
 * state the mockup has no equivalent for.
 */
export function KpiTile({
  label,
  value,
  note,
  tone,
  selected,
  onClick,
}: {
  label: string;
  value: number | string;
  note?: string;
  /** Not in the mockup: `warn`, for the Timeout tile, between good and bad. */
  tone?: keyof typeof VALUE_TONE;
  selected?: boolean;
  onClick?: () => void;
}) {
  const box = `${BOX} ${selected ? 'border-accent-soft-border bg-accent-soft' : 'border-border bg-surface'}`;

  const body = (
    <>
      <div className="text-xs font-bold uppercase tracking-[.04em] text-ink-muted">{label}</div>
      <div
        className={`mt-1.5 font-mono text-5xl font-semibold tracking-[-0.01em] strip:mt-0 strip:text-md ${tone ? VALUE_TONE[tone] : ''}`}
        data-testid="kpi-value"
      >
        {value}
      </div>
      {note && <div className="mt-0.75 text-xs text-ink-faint strip:hidden">{note}</div>}
    </>
  );

  if (!onClick) {
    return (
      <div className={box} data-testid="kpi-tile">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${box} cursor-pointer transition-colors hover:border-border-strong`}
      data-testid="kpi-tile"
      onClick={onClick}
      aria-pressed={!!selected}
      // Without this the name is the label and value run together ("Timeout1").
      aria-label={`${label}: ${value}`}
    >
      {body}
    </button>
  );
}

/** A tile while its number loads: label, value and note as bars. */
export function KpiTileSkeleton() {
  return (
    <div className={`${BOX} border-border bg-surface`} data-testid="kpi-tile">
      <Skeleton className="h-2.75 w-[60%]" />
      <Skeleton className="mt-3 h-7 w-[40%]" />
      <Skeleton className="mt-2 h-2.75 w-[80%]" />
    </div>
  );
}
