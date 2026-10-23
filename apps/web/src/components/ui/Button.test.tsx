import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('does not submit the form it sits in, unless it is the submit button', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Button>Cancel</Button>
        <Button type="submit" variant="primary">
          OK
        </Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('passes its props through: a disabled icon button is not clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="icon" aria-label="Edit" disabled onClick={onClick}>
        <svg />
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
