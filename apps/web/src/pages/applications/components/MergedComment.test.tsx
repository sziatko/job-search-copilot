import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApplicationComment, CommentSource } from '@/lib/applications/types';
import { MergedComment } from './MergedComment';

const comment = (
  id: number,
  createdAt: string,
  body: string,
  source: CommentSource,
): ApplicationComment => ({ id, createdAt, body, source });

/** Each comment's source and text, in render order — the source is who wrote it, which
 * the text alone cannot show (only its style does). */
function partsOf(container: HTMLElement): [string | undefined, string | null][] {
  return [...container.querySelectorAll<HTMLElement>('[data-source]')].map((el) => [
    el.dataset.source,
    el.textContent,
  ]);
}

/** The cell's text. jsdom measures nothing, so no Show more button joins it. */
const clampedTextOf = (container: HTMLElement) => container.textContent ?? '';

describe('MergedComment', () => {
  it('renders every comment in the order given, dated, styled by its source', () => {
    const { container } = render(
      <MergedComment
        comments={[
          comment(1, '2026-09-10T10:00:00Z', 'Strong match.', 'ANALYZER'),
          comment(2, '2026-09-12T10:00:00Z', 'My own note', 'USER'),
          comment(3, '2026-09-14T10:00:00Z', 'Recruiter called', 'AGENT'),
        ]}
      />,
    );

    expect(partsOf(container)).toEqual([
      ['ANALYZER', 'Sep 10: Strong match.'],
      ['USER', 'Sep 12: My own note'],
      ['AGENT', 'Sep 14: Recruiter called'],
    ]);
    // Collapsed, the parts are joined on one line — so the separator is the only
    // thing marking where one comment stops and the next begins.
    expect(clampedTextOf(container)).toBe(
      'Sep 10: Strong match. — Sep 12: My own note — Sep 14: Recruiter called',
    );
  });

  it('renders a lone comment with no separator', () => {
    const { container } = render(
      <MergedComment comments={[comment(1, '2026-09-14T10:00:00Z', 'Only one', 'USER')]} />,
    );

    expect(partsOf(container)).toHaveLength(1);
    expect(clampedTextOf(container)).not.toContain('—');
  });

  it('falls back to an em dash when there are no comments', () => {
    render(<MergedComment comments={[]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
