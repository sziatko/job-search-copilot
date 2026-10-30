import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonCard } from './SkeletonCard';

describe('SkeletonCard', () => {
  it('is decoration: hidden, with a bar for its heading and one per line', () => {
    const { container } = render(<SkeletonCard lines={3} />);
    const card = container.firstElementChild;
    expect(card).toHaveAttribute('aria-hidden', 'true');
    // Each bar is a hidden `Skeleton` — the same attribute the page tests read.
    expect(card?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    expect(container).toHaveTextContent('');
  });
});
