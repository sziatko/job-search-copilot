import { useCallback, useRef, useState } from 'react';

/**
 * Text that clamps to two lines, with a "Show more" toggle that appears only
 * when the text actually overflows — a comment that already fits would
 * otherwise get a button that does nothing. Same `.comment-cell` styling as the
 * applications table's merged comment, over a single source.
 */
export function ExpandableText({ text }: { text: string }) {
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

  return (
    <div className={`comment-cell ${expanded ? 'expanded' : ''}`}>
      <div ref={measureRef} className="clamp">
        {text}
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
