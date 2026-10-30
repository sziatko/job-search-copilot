import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput';

afterEach(() => {
  vi.useRealTimers();
});

describe('SearchInput', () => {
  it('hands the text over once typing pauses, not per key', async () => {
    // Fake time: a slow machine cannot open a pause between two keys.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search company or role' }), 'acme');
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('acme');
  });

  it('shows a value set from outside', () => {
    const { rerender } = render(<SearchInput value="" onChange={() => {}} />);
    rerender(<SearchInput value="Initech" onChange={() => {}} />);
    expect(screen.getByRole('searchbox')).toHaveValue('Initech');
  });
});
