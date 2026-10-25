import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KpiTile } from './KpiTile';

describe('KpiTile', () => {
  it('is inert without an onClick', () => {
    render(<KpiTile label="Logged" value={12} note="postings seen" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('12');
    expect(screen.getByText('postings seen')).toBeInTheDocument();
  });

  it('is a toggle named by its label and value when it filters', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <KpiTile label="Timeout" value={3} tone="warn" onClick={onClick} />,
    );

    const tile = screen.getByRole('button', { name: 'Timeout: 3' });
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    await user.click(tile);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<KpiTile label="Timeout" value={3} tone="warn" selected onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Timeout: 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
