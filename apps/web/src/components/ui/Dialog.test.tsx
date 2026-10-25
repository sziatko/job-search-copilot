import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { DialogActions, DialogSub, DialogTitle } from './Dialog';
import { Modal } from './Modal';

describe('Dialog parts', () => {
  it('name the modal by its title, with the sub-line and the actions inside', () => {
    render(
      <Modal onClose={() => {}} labelledBy="title">
        <DialogTitle id="title">Decline this vacancy?</DialogTitle>
        <DialogSub>Frontend Developer — Acme</DialogSub>
        <DialogActions>
          <Button>Cancel</Button>
        </DialogActions>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Decline this vacancy?' });
    expect(dialog).toHaveTextContent('Frontend Developer — Acme');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
