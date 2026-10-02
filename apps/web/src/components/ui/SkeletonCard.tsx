/** A card's line widths, cycled: a ragged right edge reads as text. */
const LINE_WIDTHS = [92, 76, 84, 64];

/** A card whose content is still loading: a bar for its heading over `lines` bars.
 * Decoration only — the page around it carries `aria-busy` and the `sr-only` text
 * a screen reader hears. */
export function SkeletonCard({ lines, className = '' }: { lines: number; className?: string }) {
  return (
    <div aria-hidden className={`card ${className}`}>
      <div className="card-head">
        <span className="skeleton h-[15px] w-[35%]" />
      </div>
      <div className="flex flex-col gap-[10px] px-[18px] pb-[18px] pt-[2px]">
        {Array.from({ length: lines }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
            key={i}
            className="skeleton"
            style={{ width: `${LINE_WIDTHS[i % LINE_WIDTHS.length]}%` }}
          />
        ))}
      </div>
    </div>
  );
}
