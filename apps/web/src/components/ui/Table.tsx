import { type ReactNode, useRef } from 'react';
import { useVirtualRows } from '../useVirtualRows';
import { Skeleton } from './Skeleton';

/** One column: its header, its width, and what its cell shows for a row. */
export interface Column<T> {
  header: string;
  /** In px, the cell's 36px of padding included. Authoritative in a virtualized table
   * (fixed layout: content wraps rather than widening it), a hint otherwise. The
   * columns without one split what the others leave. */
  width?: number;
  cell: (item: T) => ReactNode;
}

const CELL = 'border-b border-border px-4.5 py-3.25 align-top text-base';
// An inset shadow, not a bottom border: with `border-collapse` the border is painted
// with the table, so a sticky header would visibly detach from it while scrolling.
const HEADER =
  'sticky top-0 z-10 bg-surface px-4.5 py-2.25 text-left text-2xs font-bold uppercase tracking-[.05em] text-ink-faint shadow-[inset_0_-1px_0_var(--color-border)]';
// A list page's box: it runs to the window's bottom (its card fills the view — see
// `View`'s `fill`), 320px at the least. `contain-size` keeps the rows out of its intrinsic
// height, so the card sizes to that floor rather than to every loaded row. The stable
// gutter keeps the columns from widening by a scrollbar when a filter leaves too few
// rows to scroll.
const FILL = 'min-h-80 flex-1 contain-size scrollbar-gutter-stable';

/**
 * A list of rows under a sticky header: skeleton rows under the real header while the
 * first page loads, `empty` in place of rows, and — `virtual` — only the rows in and
 * near the window in the DOM (`useVirtualRows`), in a box that fills a list page's card.
 */
export function Table<T extends { id: number }>({
  columns,
  items,
  loading,
  skeletonRows = 8,
  empty,
  label,
  minWidth = 760,
  virtual,
  currentId,
  className = '',
}: {
  columns: readonly Column<T>[];
  items: readonly T[];
  /** The first page is on its way. `items` is empty until then, so `onEndReached`
   * cannot fire over the skeleton. */
  loading: boolean;
  skeletonRows?: number;
  /** Shown in one full-width row when there are no rows; without it the table keeps
   * just its header. */
  empty?: ReactNode;
  /** Names the scroll box, a region a screen reader can jump to. */
  label?: string;
  /** In px: narrower than this, the box scrolls sideways rather than squeezing the
   * cells. */
  minWidth?: number;
  virtual?: {
    /** The next page, when the last loaded row enters the window (ADR-0030). */
    onEndReached?: () => void;
    /** The list's filter: a change scrolls the box back to the top. */
    resetKey: string;
  };
  /** The row to mark and scroll into view — the one whose button opened a dialog. */
  currentId?: number;
  /** For the box: a height cap. */
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const noBox = useRef(null);
  const { virtualItems, paddingTop, paddingBottom, measureElement } = useVirtualRows(
    // Not virtualized, the hook gets no box: its mount-time scroll to the top would
    // undo `scrollToCurrent` below.
    virtual ? boxRef : noBox,
    virtual ? items.length : 0,
    virtual?.onEndReached,
    virtual?.resetKey,
  );
  const rows = virtual
    ? virtualItems.map(({ index }) => ({ item: items[index], index }))
    : items.map((item, index) => ({ item, index }));

  // Once per mount, not on every render: a refetch re-renders the row, and pulling the
  // list back to it would undo the user's own scrolling.
  const scrolledToCurrent = useRef(false);
  const scrollToCurrent = (row: HTMLTableRowElement | null) => {
    if (!row || scrolledToCurrent.current) return;
    scrolledToCurrent.current = true;
    row.scrollIntoView({ block: 'nearest' });
  };

  const spacer = (height: number) =>
    height > 0 && (
      <tr aria-hidden>
        <td colSpan={columns.length} style={{ height }} />
      </tr>
    );

  const Box = label ? 'section' : 'div';
  return (
    <Box
      ref={boxRef}
      aria-label={label}
      className={`overflow-auto ${virtual ? FILL : ''} ${className}`}
    >
      <table
        className={`w-full border-collapse ${virtual ? 'table-fixed' : ''}`}
        style={{ minWidth }}
        aria-busy={loading}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} className={HEADER} style={{ width: column.width }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {loading &&
            Array.from({ length: skeletonRows }, (_, row) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
              <tr key={row}>
                {columns.map((column, col) => (
                  <td key={column.header} className={CELL}>
                    {/* The bars are decoration; this is what a screen reader hears. */}
                    {row === 0 && col === 0 && <span className="sr-only">Loading…</span>}
                    <Skeleton className="h-3" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && items.length === 0 && empty && (
            <tr>
              <td colSpan={columns.length} className={CELL}>
                {empty}
              </td>
            </tr>
          )}
          {spacer(paddingTop)}
          {rows.map(({ item, index }) => {
            const current = item.id === currentId;
            return (
              <tr
                key={item.id}
                data-index={index}
                ref={virtual ? measureElement : current ? scrollToCurrent : undefined}
                aria-current={current || undefined}
                className={current ? 'bg-accent-soft/50' : 'hover:bg-surface-alt'}
              >
                {columns.map((column) => (
                  <td key={column.header} className={CELL}>
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            );
          })}
          {spacer(paddingBottom)}
        </tbody>
      </table>
    </Box>
  );
}
