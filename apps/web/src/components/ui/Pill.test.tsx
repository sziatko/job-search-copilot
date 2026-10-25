import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pill } from './Pill';
import { ScorePill } from './ScorePill';

describe('Pill', () => {
  it('shows its content', () => {
    render(<Pill tone="good">42</Pill>);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('as a score: a percentage, or a dash with no score yet', () => {
    const { container, rerender } = render(<ScorePill score={81} />);
    expect(screen.getByText('81%')).toBeInTheDocument();
    rerender(<ScorePill score={null} />);
    expect(container).toHaveTextContent(/^—$/);
  });
});
