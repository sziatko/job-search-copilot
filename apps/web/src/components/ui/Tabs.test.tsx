import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const OPTIONS = [
  { value: 'queue', label: 'Queue' },
  { value: 'done', label: 'Done' },
] as const;

describe('Tabs', () => {
  it('is a named group whose pressed button is the value; a click picks another', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs legend="List tab" options={OPTIONS} value="queue" onChange={onChange} />);

    expect(screen.getByRole('group', { name: 'List tab' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Queue' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('done');
  });
});
