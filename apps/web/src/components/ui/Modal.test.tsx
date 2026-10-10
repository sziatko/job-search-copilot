import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal';

function Host() {
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setN(n + 1)}>
        rerender {n}
      </button>
      {/* An inline onClose: a new function on every render of Host. */}
      <Modal onClose={() => setN(-1)}>
        <input aria-label="field" />
        <button type="button" onClick={() => setN(n + 1)}>
          bump
        </button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('keeps focus on the field across a parent re-render', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const field = screen.getByLabelText('field');
    await user.click(field);
    expect(field).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'bump' }));
    // The click focused "bump"; Host re-rendered, and focus must not jump back to the opener.
    expect(screen.getByRole('button', { name: 'bump' })).toHaveFocus();
    await user.click(field);
    await user.keyboard('x');
    expect(field).toHaveFocus();
    expect(field).toHaveValue('x');
  });
});
