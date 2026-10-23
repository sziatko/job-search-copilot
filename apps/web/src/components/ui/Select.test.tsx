import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterSelect } from './Select';

const OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
] as const;

describe('FilterSelect', () => {
  it('is named by its visible label and reports the picked value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterSelect label="Status" value="ALL" options={OPTIONS} onChange={onChange} />);

    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select).toHaveValue('ALL');
    await user.selectOptions(select, 'Open');
    expect(onChange).toHaveBeenCalledWith('OPEN');
  });
});
