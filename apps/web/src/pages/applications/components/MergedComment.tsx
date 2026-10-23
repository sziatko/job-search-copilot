import { ExpandableText } from '@/components/ui/ExpandableText';
import type { ApplicationComment, CommentSource } from '../types';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/** Who wrote it decides how it reads. */
const SOURCE_CLASS: Record<CommentSource, string> = {
  USER: 'text-ink',
  ANALYZER: 'text-ink-muted',
  AGENT: 'text-accent-ink',
};

/**
 * Every comment on the vacancy in one cell, in the order the API sends them (oldest
 * first), each with its date and styled by its source: on one line, joined by dashes,
 * while clamped; one under another, ruled, once expanded.
 */
export function MergedComment({ comments }: { comments: ApplicationComment[] }) {
  if (comments.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <ExpandableText>
      {(expanded) =>
        comments.map((comment, i) => (
          <span key={comment.id}>
            {i > 0 && (expanded ? <hr className="my-1 border-t border-border" /> : ' — ')}
            <span className={SOURCE_CLASS[comment.source]} data-source={comment.source}>
              <time className="mono text-ink-faint">
                {dateFormatter.format(new Date(comment.createdAt))}:{' '}
              </time>
              {comment.body}
            </span>
          </span>
        ))
      }
    </ExpandableText>
  );
}
