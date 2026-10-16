import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * The table under the header `column`, caught while its rows load: busy, the
 * "Loading…" a screen reader hears, and skeleton rows with one cell per header
 * column — so a table that gains a column but not in its skeleton fails here.
 */
export async function expectSkeletonTable(
  column: string,
  scope: Pick<typeof screen, 'findByRole'> = screen,
) {
  const header = await scope.findByRole('columnheader', { name: column });
  const table = header.closest('table') as HTMLElement;
  expect(table).toHaveAttribute('aria-busy', 'true');
  expect(within(table).getByText('Loading…')).toBeInTheDocument();
  const [, firstRow] = within(table).getAllByRole('row') as HTMLTableRowElement[];
  expect(firstRow.cells).toHaveLength(within(table).getAllByRole('columnheader').length);
  return table;
}

/** A whole page caught while it loads: busy, with the "Loading…" a screen reader
 * hears in place of its content. */
export async function expectSkeletonPage() {
  const loading = await screen.findByText('Loading…');
  const page = loading.closest('[aria-busy="true"]') as HTMLElement;
  expect(page).not.toBeNull();
  return page;
}

/** The page once everything on it loaded: nothing busy, nothing loading. */
export function expectLoadedPage() {
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
}

/** The same table once its rows arrived: `text` in it, the skeleton gone. */
export async function expectLoadedTable(table: HTMLElement, text: string) {
  expect(await within(table).findByText(text)).toBeInTheDocument();
  expect(table).toHaveAttribute('aria-busy', 'false');
  expect(within(table).queryByText('Loading…')).not.toBeInTheDocument();
}
