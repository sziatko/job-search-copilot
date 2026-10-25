import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('shows its message, and a title above it when given one', () => {
    const { rerender } = render(<EmptyState>No comments yet</EmptyState>);
    expect(screen.getByText('No comments yet')).toBeInTheDocument();

    rerender(<EmptyState title="No posting text">None has come in yet.</EmptyState>);
    expect(screen.getByText('No posting text')).toBeInTheDocument();
    expect(screen.getByText('None has come in yet.')).toBeInTheDocument();
  });
});
