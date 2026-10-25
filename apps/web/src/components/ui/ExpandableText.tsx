import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Button } from './Button';

/**
 * A table cell's long text, clamped to two lines, with a "Show more" toggle that
 * appears only when the text actually overflows — a comment that already fits would
 * otherwise get a button that does nothing. `children` as a function renders by state:
 * the merged comments' separators change when expanded.
 */
export function ExpandableText({
  children,
}: {
  children: ReactNode | ((expanded: boolean) => ReactNode);
}) {
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
    <div className="max-w-85 text-sm text-ink-soft">
      <div ref={measureRef} className={expanded ? '' : 'line-clamp-2'}>
        {typeof children === 'function' ? children(expanded) : children}
      </div>
      {clampable && (
        <Button
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setExpanded(false);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  );
}
