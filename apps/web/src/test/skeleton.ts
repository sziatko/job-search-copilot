import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * The table under the header `column`, caught while its rows load: busy, the
 * `sr-only` text a screen reader hears, and skeleton rows with one bar per header
 * column — so a table that gains a column but not in its skeleton fails here.
 */
export async function expectSkeletonTable(
  column: string,
  scope: Pick<typeof screen, 'findByRole'> = screen,
) {
  const header = await scope.findByRole('columnheader', { name: column });
  const table = header.closest('table') as HTMLElement;
  expect(table).toHaveAttribute('aria-busy', 'true');
  expect(within(table).getByText('Loading…')).toHaveClass('sr-only');
  const firstRow = table.querySelector('tbody tr') as HTMLElement;
  expect(firstRow.querySelectorAll('.skeleton')).toHaveLength(
    table.querySelectorAll('thead th').length,
  );
  return table;
}

/** A whole page caught while it loads: busy, the `sr-only` text a screen reader
 * hears, and skeleton bars in place of its content. */
export async function expectSkeletonPage() {
  const loading = await screen.findByText('Loading…');
  expect(loading).toHaveClass('sr-only');
  const page = loading.closest('[aria-busy="true"]') as HTMLElement;
  expect(page).not.toBeNull();
  expect(page.querySelector('.skeleton')).not.toBeNull();
  return page;
}

/** The page once everything on it loaded: no bar and nothing busy left. */
export function expectLoadedPage() {
  expect(document.querySelector('.skeleton')).toBeNull();
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
}

/** The same table once its rows arrived: `text` in it, the skeleton gone. */
export async function expectLoadedTable(table: HTMLElement, text: string) {
  expect(await within(table).findByText(text)).toBeInTheDocument();
  expect(table).toHaveAttribute('aria-busy', 'false');
  expect(table.querySelector('.skeleton')).toBeNull();
}
