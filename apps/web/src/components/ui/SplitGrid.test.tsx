import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitGrid } from './SplitGrid';

describe('SplitGrid', () => {
  it('holds its two columns in order', () => {
    render(
      <SplitGrid data-testid="grid">
        <div>left</div>
        <div>right</div>
      </SplitGrid>,
    );
    expect(screen.getByTestId('grid')).toHaveTextContent('leftright');
  });
});
