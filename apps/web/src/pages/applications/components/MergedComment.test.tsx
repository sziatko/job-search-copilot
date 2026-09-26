import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApplicationComment } from '../types';
import { MergedComment } from './MergedComment';

type Props = {
  userComment: string | null;
  estimationComment: string;
  comments: ApplicationComment[];
};

const comment = (id: number, createdAt: string, body: string): ApplicationComment => ({
  id,
  createdAt,
  body,
});

/** The sources in render order, by their own classes rather than by text — the
 * point of the order is who wrote it, which the text alone cannot show. */
function partsOf(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('.comment-user, .comment-status, .comment-analyzer')].map(
    (el) => el.textContent,
  );
}

const clampedTextOf = (container: HTMLElement) =>
  container.querySelector('.clamp')?.textContent ?? '';

describe('MergedComment', () => {
  it('merges user note → analyzer → dated comments, oldest first', () => {
    const { container } = render(
      <MergedComment
        userComment="My own note"
        estimationComment="Strong match."
        comments={[
          comment(1, '2026-09-14T10:00:00Z', 'Recruiter called'),
          comment(2, '2026-09-20T10:00:00Z', 'Interview booked'),
        ]}
      />,
    );

    expect(partsOf(container)).toEqual([
      'My own note',
      'Strong match.',
      'Sep 14: Recruiter called',
      'Sep 20: Interview booked',
    ]);
    // Collapsed, the parts are joined on one line — so the separator is the only
    // thing marking where one source stops and the next begins.
    expect(clampedTextOf(container)).toBe(
      'My own note — Strong match. — Sep 14: Recruiter called — Sep 20: Interview booked',
    );
    expect(container.querySelectorAll('time')).toHaveLength(2);
  });

  it('treats the analyzer placeholder "N/A" as empty', () => {
    // The backend writes 'N/A' for a vacancy that was never analysed. Rendered
    // literally it reads as a comment somebody actually wrote.
    const { container } = render(
      <MergedComment userComment="My own note" estimationComment="N/A" comments={[]} />,
    );

    expect(partsOf(container)).toEqual(['My own note']);
    expect(clampedTextOf(container)).toBe('My own note');
  });

  it.each<[string, Props]>([
    ['userComment', { userComment: 'Only a note', estimationComment: 'N/A', comments: [] }],
    [
      'comment',
      {
        userComment: null,
        estimationComment: 'N/A',
        comments: [comment(1, '2026-09-14T10:00:00Z', 'Only one')],
      },
    ],
    ['estimationComment', { userComment: null, estimationComment: 'Only analysis', comments: [] }],
  ])('renders a lone %s with no separator', (_label, props) => {
    const { container } = render(<MergedComment {...props} />);

    expect(partsOf(container)).toHaveLength(1);
    expect(clampedTextOf(container)).not.toContain('—');
  });

  it('falls back to an em dash when there is nothing to merge', () => {
    render(<MergedComment userComment={null} estimationComment="N/A" comments={[]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
