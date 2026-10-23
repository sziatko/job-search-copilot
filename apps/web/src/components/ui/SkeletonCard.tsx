import { Card, CardHead } from './Card';
import { Skeleton } from './Skeleton';

/** A card's line widths, cycled: a ragged right edge reads as text. */
const LINE_WIDTHS = [92, 76, 84, 64];

/** A card whose content is still loading: a bar for its heading over `lines` bars.
 * Decoration only — the page around it carries `aria-busy` and the `sr-only` text
 * a screen reader hears. */
export function SkeletonCard({ lines, className }: { lines: number; className?: string }) {
  return (
    <Card aria-hidden className={className}>
      <CardHead>
        <Skeleton className="h-3.75 w-[35%]" />
      </CardHead>
      <div className="flex flex-col gap-2.5 px-4.5 pt-0.5 pb-4.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
            key={i}
            className="h-3"
            style={{ width: `${LINE_WIDTHS[i % LINE_WIDTHS.length]}%` }}
          />
        ))}
      </div>
    </Card>
  );
}
