import { useCallback, useRef, useState } from 'react';

/**
 * The user's own note first (they wrote it about this specific application), then
 * the analyzer's reasoning. The whole cell clamps to 3 lines *combined* and
 * expands in place on click — same interaction as Phase 1's ExpandableText, but
 * over both parts as one unit. 'N/A' is the backend's placeholder for a
 * never-analysed vacancy — treat it as empty.
 */
export function MergedComment({
  userComment,
  estimationComment,
}: {
  userComment: string | null;
  estimationComment: string;
}) {
  const analyzer = estimationComment && estimationComment !== 'N/A' ? estimationComment : null;

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

  if (!userComment && !analyzer) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  const body = (
    <div ref={measureRef} className={expanded ? 'text-sm' : 'line-clamp-3 text-sm'}>
      {userComment && <span className="text-slate-700">{userComment}</span>}
      {userComment &&
        analyzer &&
        (expanded ? <hr className="my-1 border-t border-slate-200" /> : ' — ')}
      {analyzer && <span className="text-slate-500">{analyzer}</span>}
    </div>
  );

  if (!clampable) {
    return body;
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      onBlur={() => setExpanded(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setExpanded(false);
      }}
      className="block w-full cursor-pointer text-left"
    >
      {body}
      <span className="mt-0.5 block text-xs font-medium text-indigo-600">
        {expanded ? 'Show less' : 'Show more'}
      </span>
    </button>
  );
}
