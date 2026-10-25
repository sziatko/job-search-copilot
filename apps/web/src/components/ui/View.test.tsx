import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { View } from './View';

describe('View', () => {
  it('is a region when named, and marks a list page for the shell to fill', () => {
    const { rerender } = render(<View aria-label="Vacancies page">body</View>);
    const page = screen.getByRole('region', { name: 'Vacancies page' });
    expect(page).toHaveTextContent('body');
    expect(page).not.toHaveAttribute('data-view');

    rerender(
      <View fill aria-label="Vacancies page">
        body
      </View>,
    );
    expect(screen.getByRole('region', { name: 'Vacancies page' })).toHaveAttribute(
      'data-view',
      'fill',
    );
  });
});
