import { useCallback, useRef, useState } from 'react';

interface Part {
  text: string;
  className: string;
}

/**
 * Three sources merged into one cell, in this order: the user's own note (they wrote
 * it about this specific application), the accumulated pipeline notes from
 * update_application_status (statusComment — read-only here, written via MCP/API),
 * then the analyzer's reasoning. 'N/A' is the backend's placeholder for a
 * never-analysed vacancy — treat it as empty.
 *
 * The mockup's single-string cell clamps to two lines with a "Show more" button.
 * That styling is kept, but the toggle is measured rather than always shown: a
 * comment that already fits would otherwise display a button that does nothing.
 */
export function MergedComment({
  userComment,
  statusComment,
  estimationComment,
}: {
  userComment: string | null;
  statusComment: string | null;
  estimationComment: string;
}) {
  const analyzer = estimationComment && estimationComment !== 'N/A' ? estimationComment : null;

  const parts: Part[] = [];
  if (userComment) parts.push({ text: userComment, className: 'comment-user' });
  if (statusComment) parts.push({ text: statusComment, className: 'comment-status' });
  if (analyzer) parts.push({ text: analyzer, className: 'comment-analyzer' });

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

  if (parts.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <div className={`comment-cell ${expanded ? 'expanded' : ''}`}>
      <div ref={measureRef} className="clamp">
        {parts.map((part, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts is a fixed-order, static-length render per item
          <span key={i}>
            {i > 0 && (expanded ? <hr className="my-[4px] border-t border-border" /> : ' — ')}
            <span className={part.className}>{part.text}</span>
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
