import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MergedComment } from './MergedComment';

type Props = {
  userComment: string | null;
  statusComment: string | null;
  estimationComment: string;
};

/** The three sources in render order, by their own classes rather than by text —
 * the point of the order is who wrote it, which the text alone cannot show. */
function partsOf(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('.comment-user, .comment-status, .comment-analyzer')].map(
    (el) => el.textContent,
  );
}

const clampedTextOf = (container: HTMLElement) =>
  container.querySelector('.clamp')?.textContent ?? '';

describe('MergedComment', () => {
  it('merges the three sources in the documented order', () => {
    const { container } = render(
      <MergedComment
        userComment="My own note"
        statusComment="Recruiter asked about salary"
        estimationComment="Strong match."
      />,
    );

    expect(partsOf(container)).toEqual([
      'My own note',
      'Recruiter asked about salary',
      'Strong match.',
    ]);
    // Collapsed, the parts are joined on one line — so the separator is the only
    // thing marking where one source stops and the next begins.
    expect(clampedTextOf(container)).toBe(
      'My own note — Recruiter asked about salary — Strong match.',
    );
  });

  it('treats the analyzer placeholder "N/A" as empty', () => {
    // The backend writes 'N/A' for a vacancy that was never analysed. Rendered
    // literally it reads as a comment somebody actually wrote.
    const { container } = render(
      <MergedComment userComment="My own note" statusComment={null} estimationComment="N/A" />,
    );

    expect(partsOf(container)).toEqual(['My own note']);
    expect(clampedTextOf(container)).toBe('My own note');
  });

  it.each<[string, Props]>([
    ['userComment', { userComment: 'Only a note', statusComment: null, estimationComment: 'N/A' }],
    [
      'statusComment',
      { userComment: null, statusComment: 'Only status', estimationComment: 'N/A' },
    ],
    [
      'estimationComment',
      { userComment: null, statusComment: null, estimationComment: 'Only analysis' },
    ],
  ])('renders a lone %s with no separator', (_label, props) => {
    const { container } = render(<MergedComment {...props} />);

    expect(partsOf(container)).toHaveLength(1);
    expect(clampedTextOf(container)).not.toContain('—');
  });

  it('falls back to an em dash when there is nothing to merge', () => {
    render(<MergedComment userComment={null} statusComment={null} estimationComment="N/A" />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
