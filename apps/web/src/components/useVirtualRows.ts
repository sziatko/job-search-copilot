import { useVirtualizer } from '@tanstack/react-virtual';
import type { RefObject } from 'react';

/**
 * Row virtualization for a scrollable `<table>`. Only the rows in (and near) the
 * viewport are kept in the DOM; the rest are represented by two spacer `<tr>`s
 * whose heights push the scrollbar to the right size. Row heights are measured, so
 * variable-height rows (expanded comments) stay correct.
 *
 * Wire-up in the table:
 *   const scrollRef = useRef<HTMLDivElement>(null);
 *   const v = useVirtualRows(scrollRef, rows.length);
 *   <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
 *     <table className="table-fixed">
 *       <thead className="sticky top-0"> … </thead>
 *       <tbody>
 *         {v.paddingTop > 0 && <tr aria-hidden><td colSpan={N} style={{ height: v.paddingTop }} /></tr>}
 *         {v.virtualItems.map(vi => <tr key={rows[vi.index].id} data-index={vi.index} ref={v.measureElement}> … </tr>)}
 *         {v.paddingBottom > 0 && <tr aria-hidden><td colSpan={N} style={{ height: v.paddingBottom }} /></tr>}
 *       </tbody>
 *     </table>
 *   </div>
 */
export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  count: number,
  estimateRowHeight = 60,
) {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return {
    virtualItems,
    paddingTop,
    paddingBottom,
    measureElement: virtualizer.measureElement,
  };
}
