import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from './Chip';

describe('Chip', () => {
  it('calls onRemove from the × button its label names', async () => {
    const onRemove = vi.fn();
    render(
      <Chip tone="good" onRemove={onRemove} removeLabel="Remove tag Remote">
        Remote
      </Chip>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag Remote' }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(screen.getByText('Remote')).toBeInTheDocument();
  });

  it('has no button without onRemove', () => {
    render(<Chip tone="neutral">Remote</Chip>);

    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
