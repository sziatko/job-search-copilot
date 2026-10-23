import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Checkbox, Input, Label, Textarea } from './Field';

describe('Field', () => {
  it('names an input and a textarea by their labels', () => {
    render(
      <>
        <Label htmlFor="rate">Salary / rate</Label>
        <Input id="rate" />
        <Label htmlFor="note">Comment</Label>
        <Textarea id="note" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Salary / rate' }).tagName).toBe('INPUT');
    expect(screen.getByRole('textbox', { name: 'Comment' }).tagName).toBe('TEXTAREA');
  });

  it('wraps a checkbox in its label, so the text toggles it', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Used a tailored resume" />);

    await user.click(screen.getByText('Used a tailored resume'));
    expect(screen.getByRole('checkbox', { name: 'Used a tailored resume' })).toBeChecked();
  });

  it('is a radio when asked, and can be disabled', () => {
    render(
      <>
        <Checkbox type="radio" name="scope" label="All" />
        <Checkbox label="Hide Filtered out" disabled />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Hide Filtered out' })).toBeDisabled();
  });
});
