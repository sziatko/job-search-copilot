import { useCallback, useRef, useState } from 'react';
import type { ApplicationComment, CommentSource } from '../types';

const dateFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/** Who wrote it decides how it reads. */
const SOURCE_CLASS: Record<CommentSource, string> = {
  USER: 'comment-user',
  ANALYZER: 'comment-analyzer',
  AGENT: 'comment-status',
};

/**
 * Every comment on the vacancy in one cell, in the order the API sends them (oldest
 * first), each with its date and styled by its source.
 *
 * The mockup's single-string cell clamps to two lines with a "Show more" button.
 * That styling is kept, but the toggle is measured rather than always shown: a
 * comment that already fits would otherwise display a button that does nothing.
 */
export function MergedComment({ comments }: { comments: ApplicationComment[] }) {
  const [clampable, setClampable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const measureRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!el) return;
    const check = () => {
      if (!expandedRef.current) setClampable(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    observerRef.current = new ResizeObserver(check);
    observerRef.current.observe(el);
  }, []);

  if (comments.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <div className={`comment-cell ${expanded ? 'expanded' : ''}`}>
      <div ref={measureRef} className="clamp">
        {comments.map((comment, i) => (
          <span key={comment.id}>
            {i > 0 && (expanded ? <hr className="my-[4px] border-t border-border" /> : ' — ')}
            <span className={SOURCE_CLASS[comment.source]} data-source={comment.source}>
              <time className="mono text-ink-faint">
                {dateFormatter.format(new Date(comment.createdAt))}:{' '}
              </time>
              {comment.body}
            </span>
          </span>
        ))}
      </div>
      {clampable && (
        <button
          type="button"
          className="show-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setExpanded(false);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
