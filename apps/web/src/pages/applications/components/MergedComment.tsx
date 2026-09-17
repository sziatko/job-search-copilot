import { useCallback, useRef, useState } from 'react';

interface Part {
  text: string;
  className: string;
}

/**
 * Three sources merged into one cell, in this order: the user's own note (they wrote
 * it about this specific application), the accumulated pipeline notes from
 * update_application_status (statusComment — read-only here, written via MCP/API),
 * then the analyzer's reasoning. The whole cell clamps to 3 lines *combined* and
 * expands in place on click — same interaction as Phase 1's ExpandableText, but over
 * all parts as one unit. 'N/A' is the backend's placeholder for a never-analysed
 * vacancy — treat it as empty.
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
  if (userComment) parts.push({ text: userComment, className: 'text-slate-700' });
  if (statusComment) parts.push({ text: statusComment, className: 'text-indigo-700' });
  if (analyzer) parts.push({ text: analyzer, className: 'text-slate-500' });

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
    return <span className="text-sm text-slate-400">—</span>;
  }

  const body = (
    <div ref={measureRef} className={expanded ? 'text-sm' : 'line-clamp-3 text-sm'}>
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts is a fixed-order, static-length render per item
        <span key={i}>
          {i > 0 && (expanded ? <hr className="my-1 border-t border-slate-200" /> : ' — ')}
          <span className={part.className}>{part.text}</span>
        </span>
      ))}
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
