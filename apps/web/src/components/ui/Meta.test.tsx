import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meta } from './Meta';

describe('Meta', () => {
  it('shows its text, as the element it is asked to be', () => {
    render(<Meta as="time">3 days ago</Meta>);
    const meta = screen.getByText('3 days ago');
    expect(meta.tagName).toBe('TIME');
  });
});
