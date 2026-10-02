/** Placeholder rows for a table whose rows are still loading: the table keeps its
 * real `<thead>`, and these fill its `<tbody>` in the meantime. The bars are
 * decoration; the `sr-only` text is what a screen reader hears in their place. */
export function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return Array.from({ length: rows }, (_, row) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
    <tr key={row} className="hover:bg-transparent">
      {Array.from({ length: cols }, (_, col) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
        <td key={col}>
          {row === 0 && col === 0 && <span className="sr-only">Loading…</span>}
          <span aria-hidden className="skeleton" />
        </td>
      ))}
    </tr>
  ));
}
