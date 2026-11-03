import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CommentSource } from '@/lib/vacancies/types';
import { Comments } from './Comments';

const comment = (id: number, source: CommentSource) => ({
  id,
  source,
  body: '**Stack: 85%**',
  createdAt: '2026-09-14T10:00:00Z',
});

describe('Comments', () => {
  it("bolds the analyzer's markers", () => {
    render(<Comments comments={[comment(1, 'ANALYZER')]} />);

    expect(screen.getByText('Stack: 85%').tagName).toBe('STRONG');
  });

  it.each(['USER', 'AGENT'] as const)('leaves the markers of a %s comment as typed', (source) => {
    render(<Comments comments={[comment(1, source)]} />);

    expect(screen.getByText('**Stack: 85%**').tagName).not.toBe('STRONG');
  });
});
