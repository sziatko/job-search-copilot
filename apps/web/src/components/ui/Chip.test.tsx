import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from './Chip';

describe('Chip', () => {
  it('calls onRemove from the × button its label names', async () => {
    const onRemove = vi.fn();
    render(
      <Chip color="green" onRemove={onRemove} removeLabel="Remove tag Remote">
        Remote
      </Chip>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag Remote' }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(screen.getByText('Remote')).toBeInTheDocument();
  });

  it('turns the × off under removeDisabled', () => {
    render(
      <Chip color="green" onRemove={() => {}} removeLabel="Remove tag Remote" removeDisabled>
        Remote
      </Chip>,
    );

    expect(screen.getByRole('button', { name: 'Remove tag Remote' })).toBeDisabled();
  });

  it('is smaller only when dense', () => {
    render(
      <>
        <Chip color="green">Full</Chip>
        <Chip color="green" dense>
          Dense
        </Chip>
      </>,
    );

    expect(screen.getByText('Full').parentElement).toHaveClass('py-1');
    expect(screen.getByText('Dense').parentElement).toHaveClass('py-0');
  });

  it('takes a colour no tone has', () => {
    render(<Chip color="violet">Dream</Chip>);

    expect(screen.getByText('Dream').parentElement).toHaveClass('text-violet-ink');
  });

  it('has no button without onRemove', () => {
    render(<Chip color="grey">Remote</Chip>);

    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
