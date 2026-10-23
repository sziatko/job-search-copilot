import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CenterColumn } from './CenterColumn';

describe('CenterColumn', () => {
  it('is the main landmark when a screen of its own', () => {
    render(
      <CenterColumn as="main">
        <h2>Sign in</h2>
      </CenterColumn>,
    );
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Sign in' }),
    );
  });

  it('is no landmark by default', () => {
    render(<CenterColumn>Coming soon</CenterColumn>);
    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
