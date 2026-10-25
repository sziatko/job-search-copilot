import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectLoadedTable, expectSkeletonTable } from '@/test/skeleton';
import { type Column, Table } from './Table';

interface Row {
  id: number;
  name: string;
}

const COLUMNS: Column<Row>[] = [
  { header: 'Name', cell: (row) => row.name },
  { header: 'Id', width: 90, cell: (row) => `#${row.id}` },
];
const ROWS: Row[] = [
  { id: 1, name: 'Northwind' },
  { id: 2, name: 'Fabrikam' },
];

describe('Table', () => {
  it('renders a header per column and a cell per column in each row', () => {
    render(<Table columns={COLUMNS} items={ROWS} loading={false} />);

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Name', 'Id']);
    const [, first, second] = screen.getAllByRole('row');
    expect(
      within(first)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    ).toEqual(['Northwind', '#1']);
    expect(second).toHaveTextContent('Fabrikam#2');
  });

  it('shows skeleton rows under the real header while it loads, then the rows', async () => {
    const { rerender } = render(<Table columns={COLUMNS} items={[]} loading />);
    const table = await expectSkeletonTable('Name');

    rerender(<Table columns={COLUMNS} items={ROWS} loading={false} />);
    await expectLoadedTable(table, 'Northwind');
  });

  it('shows `empty` in place of rows, and not while it loads', () => {
    const { rerender } = render(
      <Table columns={COLUMNS} items={[]} loading empty="Nothing here." />,
    );
    expect(screen.queryByText('Nothing here.')).toBeNull();

    rerender(<Table columns={COLUMNS} items={[]} loading={false} empty="Nothing here." />);
    expect(screen.getByRole('cell', { name: 'Nothing here.' })).toHaveAttribute('colspan', '2');
  });

  it('names its box when given a label', () => {
    render(<Table label="Companies" columns={COLUMNS} items={ROWS} loading={false} />);
    expect(screen.getByRole('region', { name: 'Companies' })).toContainElement(
      screen.getByRole('table'),
    );
  });

  it('marks the current row and scrolls it into view once', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(
      <Table columns={COLUMNS} items={ROWS} loading={false} currentId={2} />,
    );
    rerender(<Table columns={COLUMNS} items={[...ROWS]} loading={false} currentId={2} />);

    expect(screen.getByRole('row', { current: true })).toHaveTextContent('Fabrikam');
    expect(scrollIntoView).toHaveBeenCalledOnce();
    scrollIntoView.mockRestore();
  });

  it('virtualized: renders the rows and asks for the next page at the end', () => {
    const onEndReached = vi.fn();
    render(
      <Table
        label="Companies"
        columns={COLUMNS}
        items={ROWS}
        loading={false}
        virtual={{ onEndReached, resetKey: 'ALL' }}
      />,
    );

    expect(screen.getByText('Fabrikam')).toBeInTheDocument();
    expect(onEndReached).toHaveBeenCalled();
  });
});
