import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardHead, CardSub, CardTitle } from './Card';

describe('Card', () => {
  it('is a region named by its title when it is a section', () => {
    render(
      <Card as="section" aria-labelledby="t">
        <CardHead>
          <CardTitle id="t">Details</CardTitle>
          <CardSub>3 entries</CardSub>
        </CardHead>
      </Card>,
    );

    const region = screen.getByRole('region', { name: 'Details' });
    expect(region).toHaveTextContent('3 entries');
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeInTheDocument();
  });

  it('is no landmark by default', () => {
    render(
      <Card>
        <CardTitle>Passkeys</CardTitle>
      </Card>,
    );
    expect(screen.queryByRole('region')).toBeNull();
  });
});
