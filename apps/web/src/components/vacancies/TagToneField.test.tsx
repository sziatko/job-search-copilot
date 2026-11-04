import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagToneField } from './TagToneField';

describe('TagToneField', () => {
  it('offers the ten colours by name, with the current one checked', () => {
    render(<TagToneField value="GREY" onChange={() => {}} />);

    expect(screen.getByRole('group', { name: 'Colour' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      'Grey',
      'Green',
      'Amber',
      'Red',
      'Blue',
      'Teal',
      'Violet',
      'Pink',
      'Orange',
      'Lime',
    ]);
    expect(screen.getByRole('radio', { name: 'Grey' })).toBeChecked();
  });

  it('hands over the colour picked', async () => {
    const onChange = vi.fn();
    render(<TagToneField value="GREY" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Pink' }));

    expect(onChange).toHaveBeenCalledWith('PINK');
  });
});
