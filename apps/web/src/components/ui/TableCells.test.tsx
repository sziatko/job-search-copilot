import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompanyHistoryButton, DateCell, RoleMeta, RoleTitle, RowError } from './TableCells';

describe('TableCells', () => {
  it('links a title to its posting only when the URL is one to follow', () => {
    const { rerender } = render(<RoleTitle title="Data Engineer" href="https://example.com/1" />);
    const link = screen.getByRole('link', { name: 'Data Engineer' });
    expect(link).toHaveAttribute('href', 'https://example.com/1');
    expect(link).toHaveAttribute('target', '_blank');

    rerender(<RoleTitle title="Data Engineer" href="ftp://example.com/1" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Data Engineer')).toBeInTheDocument();
  });

  it('puts the company and id under the title', () => {
    render(<RoleMeta company="Northwind" id={7} />);
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText(/Northwind/)).toBeInTheDocument();
  });

  it('shows the ⏳ and the last move only when given', () => {
    const { rerender } = render(<DateCell date="Sep 10" />);
    expect(screen.queryByText(/days since last update/)).toBeNull();
    expect(screen.queryByText(/upd:/)).toBeNull();

    rerender(<DateCell date="Sep 10" quietDays={12} updated="Sep 14" />);
    expect(screen.getByText('12 days since last update')).toBeInTheDocument();
    expect(screen.getByText('upd: Sep 14')).toBeInTheDocument();
  });

  it('opens the company history, named by how many others there are', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <CompanyHistoryButton company="Northwind" matchCount={1} onClick={onClick} />,
    );
    // The count includes the row itself: one means no others, so no button.
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<CompanyHistoryButton company="Northwind" matchCount={2} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: '1 other vacancy at Northwind' }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<CompanyHistoryButton company="Northwind" matchCount={4} onClick={onClick} />);
    expect(
      screen.getByRole('button', { name: '3 other vacancies at Northwind' }),
    ).toBeInTheDocument();
  });

  it('shows a row error only when there is one', () => {
    const { rerender, container } = render(<RowError>{undefined}</RowError>);
    expect(container).toBeEmptyDOMElement();

    rerender(<RowError>Could not save</RowError>);
    expect(screen.getByText('Could not save')).toBeInTheDocument();
  });
});
