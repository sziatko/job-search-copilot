import { useVirtualizer } from '@tanstack/react-virtual';
import { type RefObject, useEffect, useRef } from 'react';

/**
 * Row virtualization for a scrollable `<table>` — `Table`'s `virtual` prop
 * (`ui/Table.tsx`). Only the rows in (and near) the viewport are kept in the DOM; the
 * rest are represented by two spacer `<tr>`s whose heights push the scrollbar to the
 * right size. Row heights are measured, so variable-height rows (expanded comments)
 * stay correct.
 *
 * `onEndReached` is the infinite-scroll trigger (ADR-0030): called when the last
 * loaded row enters the rendered window — the overscan puts that ~12 rows before the
 * user sees it. The caller decides whether a page is due (`useInfiniteList`'s
 * `loadMore`). `resetKey` (the filter) scrolls the box back to the top when it changes.
 */
export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  count: number,
  onEndReached?: () => void,
  resetKey?: string,
) {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // A ref, so a new callback each render does not re-fire the effect: it runs when
  // the window or the row count moves, which is when "reached the end" can change.
  const onEndRef = useRef(onEndReached);
  onEndRef.current = onEndReached;
  const lastIndex = virtualItems.at(-1)?.index ?? -1;
  useEffect(() => {
    if (count > 0 && lastIndex >= count - 1) onEndRef.current?.();
  }, [lastIndex, count]);
  // A new filter is a new list (the `useInfiniteList` key): start it from the top
  // instead of at the old list's offset. `resetKey` is only a trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetKey]);
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
