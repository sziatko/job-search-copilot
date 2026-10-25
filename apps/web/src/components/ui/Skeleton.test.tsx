import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('is decoration: hidden from a screen reader, with no text', () => {
    const { container } = render(<Skeleton className="h-3" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
  });
});
