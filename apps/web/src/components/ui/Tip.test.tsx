import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tip } from './Tip';

describe('Tip', () => {
  it('names the control that holds it', () => {
    render(
      <button type="button">
        <svg aria-hidden="true" />
        <Tip>Decline</Tip>
      </button>,
    );
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('announces a flash as a status', () => {
    render(
      <Tip role="status" show>
        Copied
      </Tip>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });
});
